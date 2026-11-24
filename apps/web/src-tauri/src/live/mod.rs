mod payload;

#[cfg(test)]
mod tests;

use std::{collections::HashMap, future::Future, path::Path, sync::Arc, time::Duration};

use reqwest::{Client, Url};
use serde::Serialize;
use tauri::State;
use tokio::{
    sync::watch,
    time::{MissedTickBehavior, interval},
};

use crate::lcu::{
    Phase,
    client::{pinned_http, pinned_tls_from},
};

use self::payload::{AllGameData, ChampionCatalog};

pub const GAME_EVENT: &str = "live://game";
pub const STATUS_EVENT: &str = "live://status";
const DEFAULT_BASE: &str = "https://127.0.0.1:2999";
const POLL_PERIOD: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LiveState {
    WaitingForGame,
    Active,
}

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Status {
    pub state: LiveState,
}

#[derive(Debug)]
pub enum Notification {
    Game(payload::Game),
    Status(Status),
}

#[derive(Clone, Copy, Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid Live Client loopback HTTPS base URL")]
    Url,
    #[error("Live Client TLS configuration unavailable")]
    Tls,
    #[error("Live Client endpoint unavailable")]
    Unavailable,
    #[error("invalid Live Client JSON")]
    Json,
    #[error("Live Client roster or champion catalog unavailable")]
    Roster,
}

pub struct Catalog(watch::Sender<Arc<ChampionCatalog>>);

impl Default for Catalog {
    fn default() -> Self {
        Self(watch::Sender::new(Arc::default()))
    }
}

impl Catalog {
    pub fn replace(&self, champion_ids: HashMap<String, u32>) -> Result<(), Error> {
        let catalog = ChampionCatalog::new(champion_ids).ok_or(Error::Roster)?;
        self.0.send_replace(Arc::new(catalog));
        Ok(())
    }
}

/// Invoke with `{ championIds: { Ahri: 103, ... } }`, mapping each Data Dragon
/// champion `id` (asset slug) to its numeric `key`. Replace on catalog refresh.
#[tauri::command]
pub fn live_set_champion_ids(
    catalog: State<'_, Catalog>,
    champion_ids: HashMap<String, u32>,
) -> Result<(), String> {
    catalog
        .replace(champion_ids)
        .map_err(|error| error.to_string())
}

pub struct Supervisor {
    phase: watch::Receiver<Phase>,
    catalog: watch::Receiver<Arc<ChampionCatalog>>,
    transport: Result<(Client, Url), Error>,
}

impl Supervisor {
    pub fn new(
        phase: watch::Receiver<Phase>,
        catalog: &Catalog,
        base_url: Option<&str>,
        ca_path: Option<&Path>,
    ) -> Self {
        Self {
            phase,
            catalog: catalog.0.subscribe(),
            transport: transport(base_url.unwrap_or(DEFAULT_BASE), ca_path),
        }
    }

    pub async fn run(self, emit: impl FnMut(Notification)) {
        let Self {
            phase,
            catalog,
            transport,
        } = self;
        poll(
            phase,
            || async {
                let (client, url) = transport.as_ref().map_err(|error| *error)?;
                let raw = fetch(client, url.clone()).await?;
                raw.normalize(&catalog.borrow()).ok_or(Error::Roster)
            },
            emit,
        )
        .await;
    }
}

fn transport(base: &str, ca_path: Option<&Path>) -> Result<(Client, Url), Error> {
    let mut url = Url::parse(base).map_err(|_| Error::Url)?;
    if url.scheme() != "https"
        || url.host_str() != Some("127.0.0.1")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(Error::Url);
    }
    url.set_path("/liveclientdata/allgamedata");
    let tls = pinned_tls_from(ca_path).map_err(|_| Error::Tls)?;
    Ok((pinned_http(tls).map_err(|_| Error::Tls)?, url))
}

async fn fetch(client: &Client, url: Url) -> Result<AllGameData, Error> {
    let response = client
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|_| Error::Unavailable)?;
    if !response.status().is_success() {
        return Err(Error::Unavailable);
    }
    let bytes = response.bytes().await.map_err(|_| Error::Unavailable)?;
    serde_json::from_slice(&bytes).map_err(|_| Error::Json)
}

async fn poll<F: Future<Output = Result<payload::Game, Error>>>(
    mut phase: watch::Receiver<Phase>,
    fetch_game: impl Fn() -> F,
    mut emit: impl FnMut(Notification),
) {
    let mut state = None;
    loop {
        if *phase.borrow() != Phase::InProgress {
            set_status(&mut state, LiveState::WaitingForGame, &mut emit);
        }
        if phase
            .wait_for(|phase| *phase == Phase::InProgress)
            .await
            .is_err()
        {
            break;
        }
        let mut ticks = interval(POLL_PERIOD);
        ticks.set_missed_tick_behavior(MissedTickBehavior::Skip);
        loop {
            let update = tokio::select! {
                biased;
                _ = phase.changed() => break,
                update = async {
                    ticks.tick().await;
                    fetch_game().await
                } => update,
            };
            // Tokio checks the phase first above, but another thread can publish
            // a transition while the request is finishing.
            let current_phase = phase.borrow();
            if *current_phase != Phase::InProgress || !matches!(phase.has_changed(), Ok(false)) {
                break;
            }
            let next = if update.is_ok() {
                LiveState::Active
            } else {
                LiveState::WaitingForGame
            };
            set_status(&mut state, next, &mut emit);
            if let Ok(game) = update {
                emit(Notification::Game(game));
            }
        }
        set_status(&mut state, LiveState::WaitingForGame, &mut emit);
        if phase.has_changed().is_err() {
            break;
        }
    }
}

fn set_status(state: &mut Option<LiveState>, next: LiveState, emit: &mut impl FnMut(Notification)) {
    if *state != Some(next) {
        *state = Some(next);
        emit(Notification::Status(Status { state: next }));
    }
}
