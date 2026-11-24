pub mod client;
pub mod commands;
pub mod discovery;
mod events;
pub mod snapshot;

use std::{path::PathBuf, time::Duration};

use futures_util::{StreamExt, future::try_join4};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::{sync::watch, time::sleep};
use tokio_tungstenite::tungstenite::Message;

use self::{
    client::{LcuClient, pinned_tls_from},
    events::{Event, Socket},
    snapshot::{ChampSelectSnapshot, Session},
};

const PHASE_PATH: &str = "/lol-gameflow/v1/gameflow-phase";
const GAMEFLOW_PATH: &str = "/lol-gameflow/v1/session";
const DRAFT_PATH: &str = "/lol-champ-select/v1/session";
const PICKABLE_PATH: &str = "/lol-champ-select/v1/pickable-champion-ids";
const SUMMONER_PATH: &str = "/lol-summoner/v1/current-summoner";
const RETRY: Duration = Duration::from_secs(3);

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid LCU credentials")]
    Credentials,
    #[error("tls error")]
    Tls,
    #[error("LCU socket error")]
    Socket,
    #[error("LCU HTTP error")]
    Http,
    #[error("LCU HTTP status {0}")]
    HttpStatus(reqwest::StatusCode),
    #[error("invalid LCU path")]
    Path,
    #[error("invalid LCU JSON")]
    Json,
    #[error("invalid WAMP frame")]
    Wamp,
    #[error("LCU queue unavailable")]
    Queue,
    #[error("LCU disconnected")]
    Disconnected,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Searching,
    Connected,
    Disconnected,
}

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Status {
    pub state: State,
}

// Wire values are allowlisted, not copied into emitted string fields.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum Phase {
    None,
    Lobby,
    Matchmaking,
    CheckedIntoTournament,
    ReadyCheck,
    ChampSelect,
    GameStart,
    FailedToLaunch,
    InProgress,
    Reconnect,
    WaitingForStats,
    PreEndOfGame,
    EndOfGame,
    TerminatedInError,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Serialize)]
pub struct Gameflow {
    pub phase: Phase,
}

pub enum Notification {
    Status(Status),
    Gameflow(Gameflow),
    ChampSelect(ChampSelectSnapshot),
    Diagnostic(Error),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlowSession {
    game_data: Option<GameData>,
}

#[derive(Deserialize)]
struct GameData {
    queue: Option<Queue>,
}

#[derive(Deserialize)]
struct Queue {
    id: u32,
}

impl FlowSession {
    fn queue(self) -> Option<u32> {
        self.game_data?
            .queue
            .map(|queue| queue.id)
            .filter(|id| *id != 0)
    }
}

pub struct Supervisor {
    settings_path: watch::Receiver<Option<PathBuf>>,
    connection: watch::Sender<Option<LcuClient>>,
    ca_path: Option<PathBuf>,
    lockfile_override: Option<PathBuf>,
}

impl Supervisor {
    pub fn new(
        settings_path: watch::Receiver<Option<PathBuf>>,
        connection: watch::Sender<Option<LcuClient>>,
        ca_path: Option<PathBuf>,
        lockfile_override: Option<PathBuf>,
    ) -> Self {
        Self {
            settings_path,
            connection,
            ca_path,
            lockfile_override,
        }
    }

    pub async fn run(mut self, mut emit: impl FnMut(Notification)) {
        emit(Notification::Status(Status {
            state: State::Searching,
        }));
        loop {
            let path = self.settings_path.borrow_and_update().clone();
            let lockfile_override = self.lockfile_override.clone();
            let discovered = tokio::task::spawn_blocking(move || {
                discovery::discover(lockfile_override.as_deref(), path.as_deref())
            })
            .await
            .unwrap_or(Err(Error::Credentials));
            match discovered {
                Ok(Some(credentials)) => {
                    let result = match pinned_tls_from(self.ca_path.as_deref())
                        .and_then(|tls| LcuClient::new(credentials, tls))
                    {
                        Ok(client) => tokio::select! {
                            result = Self::session(&self.connection, client, &mut emit) => result,
                            changed = self.settings_path.changed() => {
                                if changed.is_err() { return; }
                                Ok(())
                            },
                        },
                        Err(error) => Err(error),
                    };
                    if let Err(error) = result {
                        emit(Notification::Diagnostic(error));
                    }
                    if self.connection.send_replace(None).is_some() {
                        emit(Notification::Status(Status {
                            state: State::Disconnected,
                        }));
                        emit(Notification::Gameflow(Gameflow { phase: Phase::None }));
                        emit(Notification::Status(Status {
                            state: State::Searching,
                        }));
                    }
                }
                Ok(None) => {}
                Err(error) => emit(Notification::Diagnostic(error)),
            }
            tokio::select! {
                () = sleep(RETRY) => {},
                changed = self.settings_path.changed() => {
                    if changed.is_err() { return; }
                },
            }
        }
    }

    async fn session(
        connection: &watch::Sender<Option<LcuClient>>,
        client: LcuClient,
        emit: &mut impl FnMut(Notification),
    ) -> Result<(), Error> {
        // Subscribe first so changes during the initial REST reads are queued.
        let socket = events::subscribe(&client).await?;
        let (phase, flow, session, _) = try_join4(
            client.get::<Phase>(PHASE_PATH),
            client.get_optional::<FlowSession>(GAMEFLOW_PATH),
            client.get_optional::<Session>(DRAFT_PATH),
            client.get::<commands::Identity>(SUMMONER_PATH),
        )
        .await?;
        let queue = flow.and_then(FlowSession::queue);
        connection.send_replace(Some(client.clone()));
        emit(Notification::Status(Status {
            state: State::Connected,
        }));
        emit(Notification::Gameflow(Gameflow { phase }));
        let mut draft = DraftContext { phase, queue };
        if let Some(session) = session {
            draft.emit_snapshot(&client, session, emit).await?;
        }
        draft.listen(&client, socket, emit).await
    }
}

struct DraftContext {
    phase: Phase,
    queue: Option<u32>,
}

impl DraftContext {
    async fn read_queue(client: &LcuClient) -> Result<Option<u32>, Error> {
        Ok(client
            .get_optional::<FlowSession>(GAMEFLOW_PATH)
            .await?
            .and_then(FlowSession::queue))
    }

    async fn emit_snapshot(
        &mut self,
        client: &LcuClient,
        session: Session,
        emit: &mut impl FnMut(Notification),
    ) -> Result<(), Error> {
        if self.queue.is_none() {
            self.queue = Self::read_queue(client).await?;
        }
        let queue = self.queue.ok_or(Error::Queue)?;
        let pickable = client.get(PICKABLE_PATH).await?;
        emit(Notification::ChampSelect(
            session.normalize(queue, pickable),
        ));
        Ok(())
    }

    async fn listen(
        &mut self,
        client: &LcuClient,
        mut socket: Socket,
        emit: &mut impl FnMut(Notification),
    ) -> Result<(), Error> {
        while let Some(frame) = socket.next().await {
            match frame.map_err(|_| Error::Socket)? {
                Message::Text(text) => {
                    let result = match events::parse(text.as_str()) {
                        Ok(event) => self.apply(client, event, emit).await,
                        Err(error) => Err(error),
                    };
                    if let Err(error) = result {
                        emit(Notification::Diagnostic(error));
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
        Ok(())
    }

    async fn apply(
        &mut self,
        client: &LcuClient,
        event: Event,
        emit: &mut impl FnMut(Notification),
    ) -> Result<(), Error> {
        match event {
            Event::Phase(data) => {
                let phase: Phase = decode(data)?;
                if phase == self.phase {
                    return Ok(());
                }
                self.phase = phase;
                self.queue = None;
                emit(Notification::Gameflow(Gameflow { phase }));
                if phase == Phase::ChampSelect {
                    self.queue = Self::read_queue(client).await?;
                    // Entry can precede creation; the session event supplies
                    // the snapshot and refreshes this independently.
                    client.get_optional::<Vec<u32>>(PICKABLE_PATH).await?;
                }
            }
            Event::Gameflow(data) => {
                self.queue = decode::<FlowSession>(data)?.queue();
            }
            Event::Draft(data) => {
                self.emit_snapshot(client, decode(data)?, emit).await?;
            }
            Event::Ignore => {}
        }
        Ok(())
    }
}

fn decode<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, Error> {
    serde_json::from_value(value).map_err(|_| Error::Json)
}
