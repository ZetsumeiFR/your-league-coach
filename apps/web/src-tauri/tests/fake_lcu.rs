use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use app_lib::lcu::{
    Error, Notification, State, Supervisor,
    client::{pinned_http, pinned_tls_from},
    snapshot::ChampSelectSnapshot,
};
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
                Notification::Gameflow(flow) => println!("lcu://gameflow {:?}", flow.phase),
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
        let snapshots = [supervisor.snapshot().await, supervisor.snapshot().await];
        assert!(snapshots.iter().all(|snapshot| snapshot.queue_id == 420));
        assert!(snapshots.iter().all(|snapshot| snapshot.local_pick.champion_id == 103));
        assert_eq!(snapshots.map(|snapshot| snapshot.local_pick.completed), [false, true]);

        // The next (ARAM) event is a barrier: extra ranked snapshots fail here.
        replay(fake.replay_url("champ-select-aram"), &ca).await;
        let aram = supervisor.snapshot().await;
        assert_eq!((aram.queue_id, aram.local_pick.champion_id, aram.local_pick.completed), (450, 22, true));
        // After observing hover, kill the server before the delayed lock frame.
        let ca_for_replay = ca.clone();
        let url = format!("{}&delayMs=2000", fake.replay_url("champ-select-ranked"));
        let mut interrupted = JoinSet::new();
        interrupted.spawn(async move { replay(url, &ca_for_replay).await });
        let hover = supervisor.snapshot().await;
        assert_eq!((hover.queue_id, hover.local_pick.completed), (420, false));
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
                _ => panic!("expected disconnect without the locked snapshot"),
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
        match supervisor.next().await {
            Notification::Diagnostic(Error::Tls) => {}
            _ => panic!("expected TLS rejection before any connected event"),
        }
        fake.stop().await;
        drop(supervisor);
        temp.close().expect("remove generated CAs and test temp directory");
    }).await.expect("full integration deadline");
}
