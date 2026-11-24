use std::cell::Cell;

use serde_json::{Value, json};
use tokio::{
    sync::mpsc,
    time::{Instant, advance, timeout},
};

use super::*;

const FIXTURE: &str =
    include_str!("../../../../../scripts/fake-riot-client/fixtures/live/allgamedata.json");
const SENTINEL: &str = "SENTINEL_NAME_DO_NOT_SHOW";

fn catalog() -> ChampionCatalog {
    ChampionCatalog::new(HashMap::from([
        ("Ahri".into(), 103),
        ("Garen".into(), 86),
        ("Zed".into(), 238),
    ]))
    .expect("Data Dragon catalog")
}

fn game() -> payload::Game {
    serde_json::from_str::<AllGameData>(FIXTURE)
        .expect("synthetic Live Client fixture")
        .normalize(&catalog())
        .expect("recognized roster")
}

#[test]
fn serializes_only_allowed_fields_and_canonical_champion_slug() {
    let mut input: Value = serde_json::from_str(FIXTURE).unwrap();
    input["gameData"]["gameMode"] = json!(SENTINEL);
    input["allPlayers"][2]["rawChampionName"] = json!("game_character_displayname_aHrI");
    input["activePlayer"]["abilities"] = json!({"Q": {"displayName": SENTINEL, "cooldown": 42}});
    let output = serde_json::to_string(
        &serde_json::from_value::<AllGameData>(input)
            .unwrap()
            .normalize(&catalog())
            .unwrap(),
    )
    .unwrap();
    for forbidden in [
        SENTINEL,
        "summonerName",
        "riotId",
        "displayName",
        "rawChampionName",
        "EventName",
        "EventTime",
        "mapName",
        "cooldown",
    ] {
        assert!(!output.contains(forbidden), "{output}");
    }
    assert_eq!(
        serde_json::from_str::<Value>(&output).unwrap(),
        json!({
            "gameMode": "UNKNOWN",
            "gameTime": 635.5,
            "activePlayer": {"championName": "Ahri", "level": 9, "currentGold": 815.25},
            "myItems": [1056, 2003, 2003],
            "allies": [{"championId": 86, "items": [1055]}],
            "enemies": [{"championId": 238, "items": [1058]}],
        })
    );
}

#[test]
fn rejects_malformed_data_and_ambiguous_or_unknown_roster() {
    for input in [&FIXTURE[..FIXTURE.len() / 2], "{}", "{\"allPlayers\":3}"] {
        assert!(serde_json::from_str::<AllGameData>(input).is_err());
    }
    for (key, value) in [
        ("rawChampionName", json!(SENTINEL)),
        ("riotId", json!(SENTINEL)),
    ] {
        let mut input: Value = serde_json::from_str(FIXTURE).unwrap();
        input["allPlayers"][0][key] = value;
        let raw: AllGameData = serde_json::from_value(input).unwrap();
        assert!(raw.normalize(&catalog()).is_none());
    }
}

#[test]
fn only_accepts_loopback_https_bases() {
    assert!(transport(DEFAULT_BASE, None).is_ok());
    for base in [
        "http://127.0.0.1:2999",
        "https://localhost:2999",
        "https://192.0.2.1:2999",
        "https://user:pass@127.0.0.1",
        "https://127.0.0.1/liveclientdata",
        "https://127.0.0.1?secret=no",
    ] {
        assert!(matches!(transport(base, None), Err(Error::Url)), "{base}");
    }
}

#[tokio::test(start_paused = true)]
async fn stops_in_flight_poll_and_restarts_without_reemitting_stale_data() {
    let (phase, phases) = watch::channel(Phase::Lobby);
    let (start, mut starts) = mpsc::unbounded_channel();
    let (emit, mut events) = mpsc::unbounded_channel();
    let attempts = Cell::new(0);
    let run = poll(
        phases,
        || {
            let attempt = attempts.get() + 1;
            attempts.set(attempt);
            start.send(Instant::now()).unwrap();
            async move {
                if attempt == 3 {
                    std::future::pending::<()>().await;
                }
                Ok(game())
            }
        },
        |event| emit.send(event).unwrap(),
    );
    let drive = async {
        let status = |notification, expected| {
            assert!(
                matches!(notification, Notification::Status(Status { state }) if state == expected)
            );
        };
        status(events.recv().await.unwrap(), LiveState::WaitingForGame);
        advance(POLL_PERIOD * 2).await;
        assert!(starts.try_recv().is_err());

        phase.send(Phase::InProgress).unwrap();
        let first = starts.recv().await.unwrap();
        status(events.recv().await.unwrap(), LiveState::Active);
        assert!(matches!(
            events.recv().await.unwrap(),
            Notification::Game(_)
        ));
        advance(POLL_PERIOD).await;
        assert_eq!(starts.recv().await.unwrap() - first, POLL_PERIOD);
        assert!(matches!(
            events.recv().await.unwrap(),
            Notification::Game(_)
        ));
        advance(POLL_PERIOD).await;
        assert_eq!(starts.recv().await.unwrap() - first, POLL_PERIOD * 2);

        phase.send(Phase::EndOfGame).unwrap();
        status(events.recv().await.unwrap(), LiveState::WaitingForGame);
        advance(POLL_PERIOD * 2).await;
        assert!(starts.try_recv().is_err());
        assert!(events.try_recv().is_err());

        phase.send(Phase::InProgress).unwrap();
        let resumed_at = Instant::now();
        assert_eq!(starts.recv().await.unwrap(), resumed_at);
        status(events.recv().await.unwrap(), LiveState::Active);
        assert!(matches!(
            events.recv().await.unwrap(),
            Notification::Game(_)
        ));
        drop(phase);
    };
    timeout(POLL_PERIOD * 10, async { tokio::join!(run, drive) })
        .await
        .expect("paused-time supervisor deadline");
}
