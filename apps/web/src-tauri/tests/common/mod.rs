use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use app_lib::lcu::client::{pinned_http, pinned_tls_from};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::{Child, Command},
    time::timeout,
};

pub const DEADLINE: Duration = Duration::from_secs(15);

fn scripts() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../scripts/fake-riot-client")
}

pub async fn generate_certs(directory: &Path) {
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

pub struct Fake {
    child: Child,
    pub port: u16,
    lockfile: PathBuf,
}

impl Fake {
    pub async fn start(lockfile: &Path, certs: &Path) -> Self {
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

    pub async fn stop(mut self) {
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

    pub fn control(&self, endpoint: &str) -> String {
        format!("https://127.0.0.1:{}/__control/{endpoint}", self.port)
    }

    pub fn replay_url(&self, scenario: &str) -> String {
        self.control(&format!("replay?scenario={scenario}"))
    }
}

pub async fn replay(url: String, ca: &Path) {
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
