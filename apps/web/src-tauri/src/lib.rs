pub mod lcu;

use std::path::PathBuf;

use lcu::{
    Notification, State, Status, Supervisor,
    commands::{self, LcuState},
};
use tauri::{Emitter, Manager};
use tauri_plugin_store::StoreExt;
use tokio::sync::watch;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::lcu_status,
            commands::lcu_set_lockfile_path,
            commands::lcu_current_summoner,
            commands::lcu_champion_mastery,
            commands::lcu_recent_games,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let path = app
                .store("settings.json")?
                .get("lockfilePath")
                .and_then(|value| value.as_str().map(PathBuf::from));
            let (path, changes) = watch::channel(path);
            let (status_tx, status) = watch::channel(Status {
                state: State::Searching,
            });
            let (client_tx, connection) = watch::channel(None);
            app.manage(LcuState {
                path,
                status,
                connection,
            });
            let handle = app.handle().clone();
            let supervisor = Supervisor::new(
                changes,
                client_tx,
                std::env::var_os("YLC_RIOT_CA").map(PathBuf::from),
                std::env::var_os("YLC_LCU_LOCKFILE").map(PathBuf::from),
            );
            tauri::async_runtime::spawn(supervisor.run(move |notification| {
                let result = match notification {
                    Notification::Status(status) => {
                        status_tx.send_replace(status);
                        log::info!(
                            "lcu://status {}",
                            match status.state {
                                State::Searching => "searching",
                                State::Connected => "connected",
                                State::Disconnected => "disconnected",
                            }
                        );
                        handle.emit("lcu://status", status)
                    }
                    Notification::Gameflow(gameflow) => handle.emit("lcu://gameflow", &gameflow),
                    Notification::ChampSelect(snapshot) => {
                        log::info!("lcu://champ-select queueId={}", snapshot.queue_id);
                        handle.emit("lcu://champ-select", &snapshot)
                    }
                    Notification::Diagnostic(error) => {
                        log::warn!("LCU: {error}");
                        return;
                    }
                };
                if result.is_err() {
                    log::warn!("LCU event delivery failed");
                }
            }));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
