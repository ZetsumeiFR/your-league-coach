pub mod lcu;
pub mod live;

use std::path::PathBuf;

use lcu::{
    Notification, Phase, State, Status, Supervisor,
    commands::{self, LcuState},
    write::{self, WriteLock},
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
            write::lcu_import_runes,
            write::lcu_set_spells,
            write::lcu_import_item_set,
            live::live_set_champion_ids,
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
            app.manage(WriteLock::default());
            let handle = app.handle().clone();
            let (phase_tx, phase) = watch::channel(Phase::None);
            let ca_path = std::env::var_os("YLC_RIOT_CA").map(PathBuf::from);
            let catalog = live::Catalog::default();
            let live_supervisor = live::Supervisor::new(
                phase,
                &catalog,
                std::env::var("YLC_LIVE_CLIENT_URL").ok().as_deref(),
                ca_path.as_deref(),
            );
            app.manage(catalog);
            let live_handle = handle.clone();
            tauri::async_runtime::spawn(live_supervisor.run(move |event| {
                let result = match event {
                    live::Notification::Game(game) => live_handle.emit(live::GAME_EVENT, game),
                    live::Notification::Status(status) => {
                        live_handle.emit(live::STATUS_EVENT, status)
                    }
                };
                if result.is_err() {
                    log::warn!("Live Client event delivery failed");
                }
            }));
            let supervisor = Supervisor::new(
                changes,
                client_tx,
                ca_path,
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
                    Notification::Gameflow(gameflow) => {
                        phase_tx.send_if_modified(|phase| {
                            let changed = *phase != gameflow.phase;
                            *phase = gameflow.phase;
                            changed
                        });
                        handle.emit("lcu://gameflow", &gameflow)
                    }
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
