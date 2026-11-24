use std::{ffi::OsStr, fs, path::Path};

use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

use super::Error;

pub struct Credentials {
    pub(super) port: u16,
    pub(super) password: String,
}

impl Credentials {
    fn new(port: &str, password: &str) -> Result<Self, Error> {
        let port = port.parse().map_err(|_| Error::Credentials)?;
        if port == 0 || password.is_empty() || password.chars().any(char::is_whitespace) {
            return Err(Error::Credentials);
        }
        Ok(Self {
            port,
            password: password.into(),
        })
    }
}

fn parse_lockfile(text: &str) -> Result<Credentials, Error> {
    let [name, pid, port, password, "https"] = <[&str; 5]>::try_from(
        text.trim_end_matches(['\r', '\n'])
            .split(':')
            .collect::<Vec<_>>(),
    )
    .map_err(|_| Error::Credentials)?
    else {
        return Err(Error::Credentials);
    };
    if name.is_empty() || pid.parse::<u32>().ok().filter(|pid| *pid != 0).is_none() {
        return Err(Error::Credentials);
    }
    Credentials::new(port, password)
}

fn read_lockfile(path: &Path) -> Result<Option<Credentials>, Error> {
    match fs::read_to_string(path) {
        Ok(text) => parse_lockfile(&text).map(Some),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(Error::Credentials),
    }
}

fn parse_args<'a>(args: impl Iterator<Item = &'a str>) -> Result<Credentials, Error> {
    let mut port = None;
    let mut password = None;
    for arg in args {
        if let Some(value) = arg.strip_prefix("--app-port=") {
            port = Some(value);
        }
        if let Some(value) = arg.strip_prefix("--remoting-auth-token=") {
            password = Some(value);
        }
    }
    Credentials::new(
        port.ok_or(Error::Credentials)?,
        password.ok_or(Error::Credentials)?,
    )
}

fn discover_process(names: &[&str]) -> Option<Credentials> {
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always),
    );
    names
        .iter()
        .flat_map(|name| system.processes_by_exact_name(OsStr::new(name)))
        .find_map(|process| parse_args(process.cmd().iter().filter_map(|arg| arg.to_str())).ok())
}

pub fn discover(
    override_path: Option<&Path>,
    settings_path: Option<&Path>,
) -> Result<Option<Credentials>, Error> {
    if let Some(path) = override_path {
        // An explicit override must not silently connect to a different client.
        return read_lockfile(path);
    }
    if let Some(credentials) = discover_process(&["LeagueClientUx", "LeagueClientUx.exe"]) {
        return Ok(Some(credentials));
    }
    let default = if cfg!(target_os = "windows") {
        Some(r"C:\Riot Games\League of Legends\lockfile")
    } else if cfg!(target_os = "macos") {
        Some("/Applications/League of Legends.app/Contents/LoL/lockfile")
    } else {
        None
    };
    let from_default = default
        .map(|path| read_lockfile(Path::new(path)))
        .transpose();
    if let Ok(Some(Some(credentials))) = from_default {
        return Ok(Some(credentials));
    }
    if let Some(path) = settings_path
        && let Some(credentials) = read_lockfile(path)?
    {
        return Ok(Some(credentials));
    }
    from_default.map(Option::flatten)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lockfile_requires_well_formed_https_credentials() {
        let credentials = parse_lockfile("LeagueClient:12:4312:example-token:https\r\n")
            .ok()
            .expect("valid lockfile");
        assert_eq!(credentials.port, 4312);
        assert_eq!(credentials.password, "example-token");
        for invalid in [
            "",
            "LeagueClient:12:4312",
            "LeagueClient:12:4312::https",
            "LeagueClient:12:4312:x:http",
            "LeagueClient:12:65536:x:https",
            "LeagueClient:pid:1:x:https",
            "LeagueClient:12:0:x:https:extra",
        ] {
            assert!(parse_lockfile(invalid).is_err());
        }
    }

    #[test]
    fn process_args_require_port_and_token() {
        let args = [
            "--other",
            "--remoting-auth-token=example-token",
            "--app-port=4312",
        ];
        let credentials = parse_args(args.into_iter()).ok().expect("valid args");
        assert_eq!(credentials.port, 4312);
        assert_eq!(credentials.password, "example-token");
        assert!(parse_args(["--app-port=4312"].into_iter()).is_err());
        assert!(parse_args(["--app-port=0", "--remoting-auth-token=x"].into_iter()).is_err());
    }

    #[tokio::test]
    async fn discovers_arguments_of_a_running_named_process() {
        use std::{process::Stdio, time::Duration};
        use tokio::{
            io::{AsyncBufReadExt, BufReader},
            process::Command,
            time::timeout,
        };

        const CHILD_MARKER: &str = "YLC_DISCOVERY_TEST_CHILD";
        if std::env::var_os(CHILD_MARKER).is_some() {
            use std::io::{Write, stdin, stdout};
            writeln!(stdout(), "ready").expect("announce child readiness");
            stdout().flush().expect("flush child readiness");
            stdin()
                .read_line(&mut String::new())
                .expect("parent shutdown");
            return;
        }
        let directory = tempfile::tempdir().expect("temporary process directory");
        let name = format!(
            "YlcLcu{}{}",
            std::process::id(),
            std::env::consts::EXE_SUFFIX
        );
        let executable = directory.path().join(&name);
        let test_binary = std::env::current_exe().expect("test executable");
        fs::copy(test_binary, &executable).expect("copy test binary under a unique process name");
        let mut child = Command::new(executable)
            .env(CHILD_MARKER, "1")
            .args([
                "--nocapture",
                "--exact",
                "--",
                "lcu::discovery::tests::discovers_arguments_of_a_running_named_process",
                "--app-port=4312",
                "--remoting-auth-token=example-token",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .expect("launch named process");
        let mut stdout = BufReader::new(child.stdout.take().expect("child stdout")).lines();
        let deadline = Duration::from_secs(5);
        timeout(deadline, async {
            while let Some(line) = stdout.next_line().await.expect("read child stdout") {
                if line == "ready" {
                    return;
                }
            }
            panic!("named process exited before readiness");
        })
        .await
        .expect("named process readiness deadline");
        let credentials =
            discover_process(&[name.as_str()]).expect("OS discovery reads child argv");
        assert_eq!(credentials.port, 4312);
        assert!(credentials.password == "example-token");
        timeout(deadline, child.kill())
            .await
            .expect("child shutdown deadline")
            .expect("kill and reap child");
    }
}
