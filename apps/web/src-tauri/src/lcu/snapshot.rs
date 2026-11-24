use serde::{Deserialize, Deserializer, Serialize, de::Error as _};

// A negative wire champion ID means no champion, not a malformed session.
fn champion_id<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u32, D::Error> {
    let id = i64::deserialize(deserializer)?;
    u32::try_from(id.max(0)).map_err(D::Error::custom)
}

fn selected_bans(ids: Vec<i32>) -> Vec<u32> {
    // Skipped/empty slots do not represent banned champions.
    ids.into_iter()
        .filter_map(|id| u32::try_from(id).ok().filter(|id| *id != 0))
        .collect()
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Position {
    Top,
    Jungle,
    Middle,
    Bottom,
    Utility,
    #[serde(rename = "", other)]
    #[default]
    Unassigned,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ActionType {
    Ban,
    Pick,
    #[serde(other)]
    #[default]
    None,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ally {
    pub cell_id: i32,
    #[serde(deserialize_with = "champion_id")]
    pub champion_id: u32,
    #[serde(deserialize_with = "champion_id")]
    pub champion_pick_intent: u32,
    pub assigned_position: Position,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Enemy {
    pub cell_id: i32,
    #[serde(deserialize_with = "champion_id")]
    pub champion_id: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bans {
    pub my_team_bans: Vec<u32>,
    pub their_team_bans: Vec<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawBans {
    pub my_team_bans: Vec<i32>,
    pub their_team_bans: Vec<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalPick {
    pub champion_id: u32,
    pub completed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampSelectSnapshot {
    pub queue_id: u32,
    pub local_player_cell_id: i32,
    pub my_team: Vec<Ally>,
    pub their_team: Vec<Enemy>,
    pub bans: Bans,
    pub current_action: ActionType,
    pub is_local_players_turn: bool,
    pub local_pick: LocalPick,
    pub pickable_champion_ids: Vec<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Action {
    actor_cell_id: i32,
    #[serde(deserialize_with = "champion_id")]
    champion_id: u32,
    completed: bool,
    is_in_progress: bool,
    #[serde(rename = "type")]
    action_type: ActionType,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Session {
    local_player_cell_id: i32,
    my_team: Vec<Ally>,
    their_team: Vec<Enemy>,
    bans: RawBans,
    actions: Vec<Vec<Action>>,
}

impl Session {
    pub(super) fn normalize(
        self,
        queue_id: u32,
        pickable_champion_ids: Vec<u32>,
    ) -> ChampSelectSnapshot {
        let mut active = self.actions.iter().flatten().filter(|action| {
            action.is_in_progress && !action.completed && action.action_type != ActionType::None
        });
        let first = active.next();
        let current = first
            .filter(|action| action.actor_cell_id == self.local_player_cell_id)
            .or_else(|| active.find(|action| action.actor_cell_id == self.local_player_cell_id))
            .or(first);
        let local = self.actions.iter().flatten().rev().find(|action| {
            action.actor_cell_id == self.local_player_cell_id
                && action.action_type == ActionType::Pick
        });
        let local_pick = match local {
            Some(action) => LocalPick {
                champion_id: action.champion_id,
                completed: action.completed,
            },
            None if queue_id == 450 => {
                let champion_id = self
                    .my_team
                    .iter()
                    .find(|ally| ally.cell_id == self.local_player_cell_id)
                    .map_or(0, |ally| ally.champion_id);
                LocalPick {
                    champion_id,
                    completed: champion_id != 0,
                }
            }
            None => LocalPick {
                champion_id: 0,
                completed: false,
            },
        };
        ChampSelectSnapshot {
            queue_id,
            local_player_cell_id: self.local_player_cell_id,
            my_team: self.my_team,
            their_team: self.their_team,
            bans: Bans {
                my_team_bans: selected_bans(self.bans.my_team_bans),
                their_team_bans: selected_bans(self.bans.their_team_bans),
            },
            current_action: current.map_or(ActionType::None, |action| action.action_type),
            is_local_players_turn: current
                .is_some_and(|action| action.actor_cell_id == self.local_player_cell_id),
            local_pick,
            pickable_champion_ids,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn normalizes_synthetic_draft_without_identity_or_free_text() {
        let fixture = include_str!(
            "../../../../../scripts/fake-riot-client/fixtures/lcu/champ-select-ranked.jsonl"
        );
        let frame = fixture
            .lines()
            .find_map(|line| {
                let frame: Value = serde_json::from_str(line).expect("valid WAMP fixture");
                frame[2]["data"]["myTeam"].is_array().then_some(frame)
            })
            .expect("draft event");
        let mut raw = frame[2]["data"].clone();
        raw["myTeam"][0]["assignedPosition"] = Value::String("SENTINEL_NAME_DO_NOT_SHOW".into());
        raw["myTeam"][0]["championId"] = Value::from(-1);
        raw["theirTeam"][0]["championId"] = Value::from(-1);
        let snapshot = serde_json::from_value::<Session>(raw)
            .expect("valid draft")
            .normalize(420, vec![1, 2]);
        let output = serde_json::to_string(&snapshot).expect("serialize snapshot");
        for forbidden in [
            "SENTINEL_NAME_DO_NOT_SHOW",
            "name",
            "summonerId",
            "puuid",
            "tagLine",
        ] {
            assert!(!output.to_lowercase().contains(&forbidden.to_lowercase()));
        }
        assert_eq!(snapshot.my_team[0].assigned_position, Position::Unassigned);
        assert_eq!(snapshot.my_team[0].champion_id, 0);
        assert_eq!(snapshot.their_team[0].champion_id, 0);
        assert_eq!(snapshot.queue_id, 420);
        assert_eq!(snapshot.pickable_champion_ids, [1, 2]);
        assert_eq!(snapshot.current_action, ActionType::Pick);
        assert!(snapshot.is_local_players_turn);
        assert!(!snapshot.local_pick.completed);
        let wire: Value = serde_json::from_str(&output).expect("snapshot JSON");
        let assert_keys = |value: &Value, keys: &[&str]| {
            let object = value.as_object().expect("snapshot object");
            assert_eq!(object.len(), keys.len());
            assert!(
                keys.iter().all(|key| object.contains_key(*key)),
                "{object:?}"
            );
        };
        assert_keys(
            &wire,
            &[
                "queueId",
                "localPlayerCellId",
                "myTeam",
                "theirTeam",
                "bans",
                "currentAction",
                "isLocalPlayersTurn",
                "pickableChampionIds",
                "localPick",
            ],
        );
        assert_keys(
            &wire["myTeam"][0],
            &[
                "cellId",
                "championId",
                "championPickIntent",
                "assignedPosition",
            ],
        );
        assert_keys(&wire["theirTeam"][0], &["cellId", "championId"]);
        assert_keys(&wire["bans"], &["myTeamBans", "theirTeamBans"]);
        assert_keys(&wire["localPick"], &["championId", "completed"]);
    }
}
