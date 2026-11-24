use std::{collections::BTreeMap, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::watch;

use super::{Error, SUMMONER_PATH, Status, client::LcuClient};

pub struct LcuState {
    pub(crate) path: watch::Sender<Option<PathBuf>>,
    pub(crate) status: watch::Receiver<Status>,
    pub(crate) connection: watch::Receiver<Option<LcuClient>>,
}

impl LcuState {
    pub fn client(&self) -> Result<LcuClient, Error> {
        self.connection.borrow().clone().ok_or(Error::Disconnected)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Identity {
    puuid: String,
    summoner_id: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentSummoner {
    puuid: String,
    summoner_id: u64,
    locale: Locale,
}

#[derive(Deserialize)]
struct RegionLocale {
    locale: Locale,
}

#[derive(Deserialize, Serialize)]
enum Locale {
    #[serde(rename = "fr_FR")]
    French,
    #[serde(rename = "en_US", other)]
    English,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mastery {
    champion_id: u32,
    champion_points: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampionMastery {
    champion_id: u32,
    mastery_points: u64,
}

#[derive(Deserialize)]
struct MatchHistory {
    games: HistoryPage,
}

#[derive(Deserialize)]
struct HistoryPage {
    games: Vec<Game>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Game {
    participant_identities: Vec<ParticipantIdentity>,
    participants: Vec<Participant>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParticipantIdentity {
    participant_id: u32,
    player: Player,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Player {
    summoner_id: Option<u64>,
    puuid: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Participant {
    participant_id: u32,
    champion_id: u32,
    stats: Stats,
}

#[derive(Deserialize)]
struct Stats {
    win: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentGames {
    champion_id: u32,
    games: usize,
    wins: usize,
}

fn command_error(error: Error) -> String {
    error.to_string()
}

#[tauri::command]
pub fn lcu_status(state: State<'_, LcuState>) -> Status {
    *state.status.borrow()
}

/// The frontend persists lockfilePath in settings.json; this applies it now.
#[tauri::command]
pub fn lcu_set_lockfile_path(state: State<'_, LcuState>, lockfile_path: Option<PathBuf>) {
    state.path.send_if_modified(|current| {
        if *current == lockfile_path {
            return false;
        }
        *current = lockfile_path;
        true
    });
}

#[tauri::command]
pub async fn lcu_current_summoner(state: State<'_, LcuState>) -> Result<CurrentSummoner, String> {
    let client = state.client().map_err(command_error)?;
    let (identity, region): (Identity, RegionLocale) = tokio::try_join!(
        client.get(SUMMONER_PATH),
        client.get("/riotclient/region-locale"),
    )
    .map_err(command_error)?;
    Ok(CurrentSummoner {
        puuid: identity.puuid,
        summoner_id: identity.summoner_id,
        locale: region.locale,
    })
}

#[tauri::command]
pub async fn lcu_champion_mastery(
    state: State<'_, LcuState>,
) -> Result<Vec<ChampionMastery>, String> {
    let mastery: Vec<Mastery> = state
        .client()
        .map_err(command_error)?
        .get("/lol-champion-mastery/v1/local-player/champion-mastery")
        .await
        .map_err(command_error)?;
    Ok(mastery
        .into_iter()
        .map(|entry| ChampionMastery {
            champion_id: entry.champion_id,
            mastery_points: entry.champion_points,
        })
        .collect())
}

#[tauri::command]
pub async fn lcu_recent_games(state: State<'_, LcuState>) -> Result<Vec<RecentGames>, String> {
    let client = state.client().map_err(command_error)?;
    let (identity, history): (Identity, MatchHistory) = tokio::try_join!(
        client.get(SUMMONER_PATH),
        client.get(
            "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=49"
        ),
    )
    .map_err(command_error)?;
    Ok(aggregate(&identity, history))
}

fn aggregate(identity: &Identity, history: MatchHistory) -> Vec<RecentGames> {
    let mut by_champion = BTreeMap::new();
    for game in history.games.games.into_iter().take(50) {
        let local = game.participant_identities.iter().find(|entry| {
            entry.player.summoner_id == Some(identity.summoner_id)
                || entry.player.puuid.as_ref() == Some(&identity.puuid)
        });
        if let Some(player) = local.and_then(|local| {
            game.participants
                .into_iter()
                .find(|participant| participant.participant_id == local.participant_id)
        }) {
            let entry = by_champion
                .entry(player.champion_id)
                .or_insert(RecentGames {
                    champion_id: player.champion_id,
                    games: 0,
                    wins: 0,
                });
            entry.games += 1;
            entry.wins += usize::from(player.stats.win);
        }
    }
    by_champion.into_values().collect()
}
