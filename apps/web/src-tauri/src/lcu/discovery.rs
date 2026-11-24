use std::{ffi::OsStr, fs, path::Path};

use sysinfo::{ProcessesToUpdate, System};

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

pub fn discover(
    override_path: Option<&Path>,
    settings_path: Option<&Path>,
) -> Result<Option<Credentials>, Error> {
    if let Some(path) = override_path {
        // An explicit override must not silently connect to a different client.
        return read_lockfile(path);
    }
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);
    for name in ["LeagueClientUx", "LeagueClientUx.exe"] {
        for process in system.processes_by_exact_name(OsStr::new(name)) {
            if let Ok(credentials) = parse_args(process.cmd().iter().filter_map(|arg| arg.to_str()))
            {
                return Ok(Some(credentials));
            }
        }
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
}
