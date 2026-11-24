use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Default)]
pub(crate) struct ChampionCatalog(HashMap<String, (String, u32)>);

impl ChampionCatalog {
    pub(super) fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub(crate) fn new(champion_ids: HashMap<String, u32>) -> Option<Self> {
        let mut catalog = HashMap::new();
        for (slug, id) in champion_ids {
            if id == 0
                || !(1..=64).contains(&slug.len())
                || !slug.bytes().all(|byte| byte.is_ascii_alphanumeric())
                || catalog
                    .insert(slug.to_ascii_lowercase(), (slug, id))
                    .is_some()
            {
                return None;
            }
        }
        Some(Self(catalog))
    }

    fn resolve(&self, raw_key: &str) -> Option<&(String, u32)> {
        let slug = raw_key.strip_prefix("game_character_displayname_")?;
        self.0.get(&slug.to_ascii_lowercase())
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum GameMode {
    Classic,
    Aram,
    Cherry,
    Swiftplay,
    Urf,
    #[serde(other)]
    Unknown,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    game_mode: GameMode,
    game_time: f64,
    active_player: ActivePlayer,
    my_items: Vec<u32>,
    allies: Vec<TeamPlayer>,
    enemies: Vec<TeamPlayer>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActivePlayer {
    champion_name: String,
    level: u32,
    current_gold: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TeamPlayer {
    champion_id: u32,
    items: Vec<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AllGameData {
    active_player: RawActivePlayer,
    all_players: Vec<RawPlayer>,
    game_data: GameData,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawActivePlayer {
    riot_id: Option<String>,
    summoner_name: Option<String>,
    level: u32,
    current_gold: f64,
}

// Identifiers are used only for the in-memory local-player join. Raw types
// never implement Serialize or Debug.
impl RawActivePlayer {
    fn matches(&self, candidate: &RawPlayer) -> bool {
        match (&self.riot_id, &candidate.riot_id) {
            (Some(local), Some(player)) if !local.is_empty() && !player.is_empty() => {
                local == player
            }
            _ => self
                .summoner_name
                .as_deref()
                .filter(|name| !name.is_empty())
                .is_some_and(|name| candidate.summoner_name.as_deref() == Some(name)),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawPlayer {
    riot_id: Option<String>,
    summoner_name: Option<String>,
    raw_champion_name: String,
    team: String,
    items: Vec<RawItem>,
}

#[derive(Deserialize)]
struct RawItem {
    #[serde(rename = "itemID")]
    id: u32,
    slot: u8,
    count: u8,
}

fn inventory(items: &[RawItem]) -> Vec<u32> {
    let mut by_slot: Vec<_> = items.iter().collect();
    by_slot.sort_unstable_by_key(|item| (item.slot, item.id));
    by_slot
        .into_iter()
        .flat_map(|item| std::iter::repeat_n(item.id, usize::from(item.count)))
        .collect()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GameData {
    game_mode: GameMode,
    game_time: f64,
}

impl AllGameData {
    pub(super) fn normalize(self, catalog: &ChampionCatalog) -> Option<Game> {
        let mut matching = self
            .all_players
            .iter()
            .enumerate()
            .filter(|(_, player)| self.active_player.matches(player));
        let (local_index, local) = matching.next()?;
        if matching.next().is_some() || local.team.is_empty() {
            return None;
        }
        let (slug, _) = catalog.resolve(&local.raw_champion_name)?;
        let mut game = Game {
            game_mode: self.game_data.game_mode,
            game_time: self.game_data.game_time,
            active_player: ActivePlayer {
                champion_name: slug.clone(),
                level: self.active_player.level,
                current_gold: self.active_player.current_gold,
            },
            my_items: inventory(&local.items),
            allies: Vec::new(),
            enemies: Vec::new(),
        };
        for (index, player) in self.all_players.iter().enumerate() {
            if index == local_index {
                continue;
            }
            let (_, id) = catalog.resolve(&player.raw_champion_name)?;
            let roster = if player.team == local.team {
                &mut game.allies
            } else {
                &mut game.enemies
            };
            roster.push(TeamPlayer {
                champion_id: *id,
                items: inventory(&player.items),
            });
        }
        Some(game)
    }
}
