use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::{Duration, Instant},
};

use app_lib::lcu::{
    Error, Notification, Phase, State, Supervisor,
    client::{pinned_http, pinned_tls_from},
    snapshot::{ActionType, ChampSelectSnapshot},
};
use app_lib::live;
use tempfile::TempDir;
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::{Child, Command},
    sync::{mpsc, watch},
    task::{JoinHandle, JoinSet},
    time::timeout,
};

const DEADLINE: Duration = Duration::from_secs(15);

fn scripts() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../scripts/fake-riot-client")
}

async fn generate_certs(directory: &Path) {
    let child = Command::new("bun")
        .arg(scripts().join("gen-certs.ts"))
        .arg(directory)
        .kill_on_drop(true)
        .spawn()
        .expect("start certificate generator");
    let output = timeout(DEADLINE, child.wait_with_output())
        .await
        .expect("certificate generation deadline")
        .expect("certificate generator exit status");
    assert!(output.status.success());
}

struct Fake {
    child: Child,
    port: u16,
    lockfile: PathBuf,
}

impl Fake {
    async fn start(lockfile: &Path, certs: &Path) -> Self {
        let mut child = Command::new("bun")
            .arg(scripts().join("index.ts"))
            .env("YLC_FAKE_LOCKFILE", lockfile)
            .env("YLC_FAKE_CERT_DIR", certs)
            .env("YLC_FAKE_PORT", "0")
            .kill_on_drop(true)
            .stdout(Stdio::piped())
            .spawn()
            .expect("start fake LCU");
        let mut stdout = BufReader::new(child.stdout.take().expect("fake stdout")).lines();
        let port = timeout(DEADLINE, async {
            let path = stdout
                .next_line()
                .await
                .expect("read fake lockfile path")
                .expect("fake lockfile path");
            assert_eq!(
                path.strip_prefix("LOCKFILE=").map(Path::new),
                Some(lockfile)
            );
            let line = stdout
                .next_line()
                .await
                .expect("read fake port")
                .expect("fake port");
            line.strip_prefix("PORT=")
                .expect("port announcement")
                .parse()
                .expect("port number")
        })
        .await
        .expect("fake readiness deadline");
        println!("fake LCU ready port={port}");
        Self {
            child,
            port,
            lockfile: lockfile.into(),
        }
    }

    async fn stop(mut self) {
        timeout(DEADLINE, self.child.kill())
            .await
            .expect("fake shutdown deadline")
            .expect("kill and reap fake");
        std::fs::remove_file(&self.lockfile).expect("remove stopped fake lockfile");
        assert!(std::net::TcpStream::connect(("127.0.0.1", self.port)).is_err());
        println!(
            "fake LCU reaped; port {} freed; lockfile removed",
            self.port
        );
    }

    fn replay_url(&self, scenario: &str) -> String {
        format!(
            "https://127.0.0.1:{}/__control/replay?scenario={scenario}",
            self.port
        )
    }
}

struct Running {
    events: mpsc::UnboundedReceiver<Notification>,
    _settings: watch::Sender<Option<PathBuf>>,
    run: JoinHandle<()>,
}

impl Drop for Running {
    fn drop(&mut self) {
        self.run.abort();
    }
}

impl Running {
    fn start(lockfile: &Path, ca: &Path) -> Self {
        Self::start_with_phases(lockfile, ca, watch::channel(Phase::None).0)
    }

    fn start_with_phases(lockfile: &Path, ca: &Path, phases: watch::Sender<Phase>) -> Self {
        let (settings, paths) = watch::channel(None);
        let (client, _) = watch::channel(None);
        let (tx, events) = mpsc::unbounded_channel();
        let supervisor = Supervisor::new(paths, client, Some(ca.into()), Some(lockfile.into()));
        let run = tokio::spawn(supervisor.run(move |event| {
            match &event {
                Notification::Status(status) => println!(
                    "lcu://status {}",
                    match status.state {
                        State::Searching => "searching",
                        State::Connected => "connected",
                        State::Disconnected => "disconnected",
                    }
                ),
                Notification::Gameflow(flow) => {
                    phases.send_replace(flow.phase);
                    println!("lcu://gameflow {:?}", flow.phase);
                }
                Notification::ChampSelect(snapshot) => println!(
                    "lcu://champ-select queueId={} championId={} completed={}",
                    snapshot.queue_id,
                    snapshot.local_pick.champion_id,
                    snapshot.local_pick.completed
                ),
                Notification::Diagnostic(error) => println!("LCU: {error}"),
            }
            let _ = tx.send(event);
        }));
        Self {
            events,
            _settings: settings,
            run,
        }
    }

    async fn next(&mut self) -> Notification {
        timeout(DEADLINE, self.events.recv())
            .await
            .expect("LCU event deadline")
            .expect("supervisor ended")
    }

    async fn status(&mut self, expected: State) {
        loop {
            match self.next().await {
                Notification::Status(status) => {
                    assert_eq!(status.state, expected);
                    return;
                }
                Notification::Diagnostic(error) => panic!("unexpected LCU error: {error}"),
                Notification::Gameflow(_) => {}
                Notification::ChampSelect(_) => panic!("unexpected draft"),
            }
        }
    }

    async fn snapshot(&mut self) -> ChampSelectSnapshot {
        loop {
            match self.next().await {
                Notification::ChampSelect(snapshot) => return snapshot,
                Notification::Gameflow(_) => {}
                _ => panic!("expected a draft event"),
            }
        }
    }
}

async fn replay(url: String, ca: &Path) {
    let client = pinned_http(pinned_tls_from(Some(ca)).expect("test CA")).expect("QA HTTP");
    let reply: serde_json::Value = client
        .post(url)
        .send()
        .await
        .expect("replay request")
        .error_for_status()
        .expect("replay status")
        .json()
        .await
        .expect("replay response");
    assert!(reply["events"].as_u64().is_some());
}

#[tokio::test]
async fn real_live_supervisor_polls_fake_and_handles_connection_refusal() {
    timeout(Duration::from_secs(25), async {
        let temp = TempDir::new().expect("QA temp directory");
        let certs = temp.path().join("certs");
        let ca = certs.join("ca.pem");
        let lockfile = temp.path().join("lockfile");
        generate_certs(&certs).await;
        let fake = Fake::start(&lockfile, &certs).await;
        let base = format!("https://127.0.0.1:{}", fake.port);
        println!("integration harness: YLC_LIVE_CLIENT_URL={base}");

        let catalog = live::Catalog::default();
        let (phase, phases) = watch::channel(Phase::None);
        let mut lcu = Running::start_with_phases(&lockfile, &ca, phase);
        let (emit, mut events) = mpsc::unbounded_channel();
        let start = Instant::now();
        let supervisor = live::Supervisor::new(phases, &catalog, Some(&base), Some(&ca));
        let running = tokio::spawn(supervisor.run(move |event| {
            match &event {
                live::Notification::Game(game) => println!(
                    "{:.3}s {} {}",
                    start.elapsed().as_secs_f64(),
                    live::GAME_EVENT,
                    serde_json::to_string(game).unwrap()
                ),
                live::Notification::Status(status) => println!(
                    "{:.3}s {} {}",
                    start.elapsed().as_secs_f64(),
                    live::STATUS_EVENT,
                    serde_json::to_string(status).unwrap()
                ),
            }
            let _ = emit.send((Instant::now(), event));
        }));
        lcu.status(State::Searching).await;
        lcu.status(State::Connected).await;
        assert_live_status(
            events.recv().await.unwrap().1,
            live::LiveState::WaitingForGame,
        );
        replay(fake.replay_url("live-game"), &ca).await;
        assert_live_status(
            events.recv().await.unwrap().1,
            live::LiveState::WaitingForCatalog,
        );
        catalog
            .replace(
                [
                    ("Ahri".into(), 103),
                    ("Garen".into(), 86),
                    ("Zed".into(), 238),
                ]
                .into(),
            )
            .expect("install synthetic Data Dragon catalog");
        assert_live_status(events.recv().await.unwrap().1, live::LiveState::Active);
        let (first_at, first) = events.recv().await.unwrap();
        assert_eq!(
            live_items(first, "myItems"),
            serde_json::json!([1056, 2003, 2003])
        );
        replay(fake.replay_url("live-game-armored"), &ca).await;
        let (second_at, second) = events.recv().await.unwrap();
        assert_eq!(
            live_items(second, "enemies")[0]["items"],
            serde_json::json!([3047, 3075, 3110])
        );
        // Exact cadence is covered under paused time; tolerate scheduling jitter here.
        assert!(second_at - first_at >= Duration::from_secs(4));
        replay(fake.replay_url("live-game-ended"), &ca).await;
        assert_live_status(
            events.recv().await.unwrap().1,
            live::LiveState::WaitingForGame,
        );
        fake.stop().await;
        drop(lcu);
        timeout(DEADLINE, running).await.unwrap().unwrap();

        // Keep InProgress but point the real Live supervisor at the just-closed
        // listener. Starting in this phase emits no status before the actual poll.
        let (phase, phases) = watch::channel(Phase::InProgress);
        let (emit, mut events) = mpsc::unbounded_channel();
        let refused = live::Supervisor::new(phases, &catalog, Some(&base), Some(&ca));
        let running = tokio::spawn(refused.run(move |event| {
            emit.send(event).expect("test event receiver");
        }));
        let status = events.recv().await.unwrap();
        assert_live_status(status, live::LiveState::WaitingForGame);
        println!(
            "connection refused at {base}: {} {} (no panic)",
            live::STATUS_EVENT,
            serde_json::to_string(&live::Status {
                state: live::LiveState::WaitingForGame
            })
            .unwrap()
        );
        drop(phase);
        timeout(DEADLINE, running).await.unwrap().unwrap();
        temp.close()
            .expect("remove fake certificates and temporary directory");
    })
    .await
    .expect("Live Client integration deadline");
}

fn assert_live_status(event: live::Notification, expected: live::LiveState) {
    assert!(
        matches!(event, live::Notification::Status(status) if status.state == expected),
        "{event:?}"
    );
}

fn live_items(event: live::Notification, key: &str) -> serde_json::Value {
    let live::Notification::Game(game) = event else {
        panic!("expected a live game, got {event:?}");
    };
    serde_json::to_value(game).unwrap()[key].clone()
}

#[tokio::test]
async fn real_supervisor_replays_draft_reconnects_and_rejects_wrong_ca() {
    timeout(Duration::from_secs(45), async {
        let temp = TempDir::new().expect("QA temp directory");
        let certs = temp.path().join("trusted");
        let other_certs = temp.path().join("untrusted");
        let ca = certs.join("ca.pem");
        let lockfile = temp.path().join("lockfile");
        let mut generators = JoinSet::new();
        for directory in [certs.clone(), other_certs.clone()] {
            generators.spawn(async move { generate_certs(&directory).await });
        }
        while let Some(result) = generators.join_next().await {
            result.expect("certificate task");
        }
        println!("generated independent test CAs; supervisor configured with trusted/ca.pem");

        let fake = Fake::start(&lockfile, &certs).await;
        let mut supervisor = Running::start(&lockfile, &ca);
        supervisor.status(State::Searching).await;
        supervisor.status(State::Connected).await;
        replay(fake.replay_url("champ-select-ranked"), &ca).await;
        // One draft: the local ban turn, picks under way, the enemy lane pick, then the local hover and lock.
        let stages = [
            supervisor.snapshot().await,
            supervisor.snapshot().await,
            supervisor.snapshot().await,
            supervisor.snapshot().await,
            supervisor.snapshot().await,
        ];
        assert!(stages.iter().all(|snapshot| snapshot.queue_id == 420));
        assert_eq!(
            stages.each_ref().map(|snapshot| (snapshot.current_action, snapshot.is_local_players_turn)),
            [(ActionType::Ban, true), (ActionType::Pick, false), (ActionType::Pick, false), (ActionType::Pick, true), (ActionType::None, false)]
        );
        assert_eq!(
            stages.each_ref().map(|snapshot| snapshot.their_team.iter().filter(|enemy| enemy.champion_id != 0).count()),
            [0, 2, 3, 5, 5]
        );
        let [ban_turn, _, lane_pick, hover, lock] = stages;
        assert_eq!(ban_turn.bans.my_team_bans, [157]);
        assert!(ban_turn.bans.their_team_bans.is_empty());
        assert!(lane_pick.their_team.iter().any(|enemy| enemy.champion_id == 238));
        let snapshots = [hover, lock];
        assert!(snapshots.iter().all(|snapshot| snapshot.local_pick.champion_id == 103));
        assert!(snapshots.iter().all(|snapshot| snapshot.bans.their_team_bans == [55, 7]));
        assert_eq!(snapshots.map(|snapshot| snapshot.local_pick.completed), [false, true]);

        // The next (ARAM) event is a barrier: extra ranked snapshots fail here.
        replay(fake.replay_url("champ-select-aram"), &ca).await;
        let aram = supervisor.snapshot().await;
        assert_eq!((aram.queue_id, aram.local_pick.champion_id, aram.local_pick.completed), (450, 22, true));
        // After observing the first draft frame (the ban turn), kill the server before the delayed rest.
        let ca_for_replay = ca.clone();
        let url = format!("{}&delayMs=2000", fake.replay_url("champ-select-ranked"));
        let mut interrupted = JoinSet::new();
        interrupted.spawn(async move { replay(url, &ca_for_replay).await });
        let first = supervisor.snapshot().await;
        assert_eq!((first.queue_id, first.current_action), (420, ActionType::Ban));
        interrupted.abort_all();
        fake.stop().await;
        // Killing mid-replay may emit a transport diagnostic before disconnect.
        loop {
            match supervisor.next().await {
                Notification::Diagnostic(Error::Socket | Error::Http) => {}
                Notification::Status(status) => {
                    assert_eq!(status.state, State::Disconnected);
                    break;
                }
                _ => panic!("expected disconnect without a later snapshot"),
            }
        }
        supervisor.status(State::Searching).await;
        let fake = Fake::start(&lockfile, &certs).await;
        supervisor.status(State::Connected).await;
        replay(fake.replay_url("champ-select-arena"), &ca).await;
        assert_eq!(supervisor.snapshot().await.queue_id, 1700);
        fake.stop().await;
        loop {
            if matches!(supervisor.next().await, Notification::Status(status) if status.state == State::Disconnected) {
                break;
            }
        }
        supervisor.status(State::Searching).await;

        let fake = Fake::start(&lockfile, &other_certs).await;
        let client = pinned_http(pinned_tls_from(Some(&ca)).expect("trusted CA")).expect("QA HTTP");
        assert!(client.post(fake.replay_url("champ-select-ranked")).send().await.expect_err("foreign CA must fail HTTPS").is_connect());
        match supervisor.next().await {
            Notification::Diagnostic(Error::Tls) => {}
            _ => panic!("expected TLS rejection before any connected event"),
        }
        fake.stop().await;
        drop(supervisor);
        temp.close().expect("remove generated CAs and test temp directory");
    }).await.expect("full integration deadline");
}
