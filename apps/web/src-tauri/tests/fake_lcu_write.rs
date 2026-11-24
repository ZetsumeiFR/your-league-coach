mod common;

use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use app_lib::lcu::{
    Error,
    client::{LcuClient, pinned_http, pinned_tls_from},
    discovery::discover,
    write::{
        Block, BlockItem, ItemSet, Owned, OwnedStore, RunePage, import_item_set, import_runes,
        set_spells,
    },
};
use common::{DEADLINE, Fake, generate_certs, replay};
use serde::de::IgnoredAny;
use serde_json::{Value, json};
use tempfile::TempDir;
use tokio::time::timeout;

const PAGES: &str = "/lol-perks/v1/pages";
const SELECTION: &str = "/lol-champ-select/v1/session/my-selection";
const SETS: &str = "/lol-item-sets/v1/item-sets/123/sets";
const SUMMONER_ID: u64 = 123;
const FLASH: u64 = 4;
const IGNITE: u64 = 14;

#[derive(Default)]
struct Record(Mutex<Owned>);

impl OwnedStore for Record {
    fn load(&self) -> Owned {
        self.0.lock().expect("record").clone()
    }

    fn save(&self, owned: &Owned) -> Result<(), Error> {
        *self.0.lock().expect("record") = owned.clone();
        Ok(())
    }
}

struct Harness {
    temp: TempDir,
    ca: PathBuf,
    fake: Fake,
    client: LcuClient,
}

impl Harness {
    async fn start() -> Self {
        let temp = TempDir::new().expect("QA temp directory");
        let certs = temp.path().join("certs");
        let ca = certs.join("ca.pem");
        let lockfile = temp.path().join("lockfile");
        generate_certs(&certs).await;
        let fake = Fake::start(&lockfile, &certs).await;
        let credentials = discover(Some(&lockfile), None)
            .expect("readable lockfile")
            .expect("fake credentials");
        let client = LcuClient::new(credentials, pinned_tls_from(Some(&ca)).expect("test CA"))
            .expect("LCU client");
        Self {
            temp,
            ca,
            fake,
            client,
        }
    }

    /// Every request the fake has received on its client API, oldest first.
    async fn requests(&self) -> Vec<Value> {
        pinned_http(pinned_tls_from(Some(&self.ca)).expect("test CA"))
            .expect("QA HTTP")
            .get(self.fake.control("requests"))
            .send()
            .await
            .expect("request log")
            .error_for_status()
            .expect("request log status")
            .json()
            .await
            .expect("request log JSON")
    }

    async fn page_ids(&self) -> Vec<i64> {
        let pages: Vec<Value> = self.client.get(PAGES).await.expect("rune pages");
        pages
            .iter()
            .filter_map(|page| page["id"].as_i64())
            .collect()
    }

    async fn stop(self) {
        self.fake.stop().await;
        self.temp.close().expect("remove QA temp directory");
    }
}

fn page() -> RunePage {
    RunePage::new(
        "YLC Ahri".into(),
        8100,
        8200,
        vec![8112, 8139, 8140, 8135, 8226, 8210, 5008, 5008, 5011],
    )
    .expect("valid page")
}

fn item_set() -> ItemSet {
    let core = Block {
        title: "Core".into(),
        items: vec![BlockItem { id: 6655, count: 1 }],
    };
    ItemSet::new(103, "YLC Ahri".into(), vec![core]).expect("valid item set")
}

async fn import(client: &LcuClient, record: &Record, uid: &str) {
    import_runes(client, record, &page())
        .await
        .expect("runes imported");
    set_spells(client, [IGNITE, FLASH])
        .await
        .expect("spells set");
    import_item_set(client, record, SUMMONER_ID, &item_set(), uid)
        .await
        .expect("item set imported");
}

fn writes(requests: &[Value]) -> Vec<(&str, &str)> {
    requests
        .iter()
        .filter(|request| request["method"] != "GET")
        .map(|request| {
            (
                request["method"].as_str().expect("request method"),
                request["path"].as_str().expect("request path"),
            )
        })
        .collect()
}

/// Kept as QA evidence when YLC_WRITE_EVIDENCE names a directory.
fn keep_evidence(name: &str, scenario: &str, requests: &[Value]) {
    if let Some(directory) = std::env::var_os("YLC_WRITE_EVIDENCE") {
        let file = Path::new(&directory).join(format!("task-15-lol-draft-coach-{name}.json"));
        let evidence = json!({ "scenario": scenario, "requests": requests });
        let text = serde_json::to_string_pretty(&evidence).expect("evidence JSON");
        std::fs::write(file, text).expect("write evidence");
    }
}

#[tokio::test]
async fn an_import_replaces_only_what_the_previous_one_created() {
    timeout(Duration::from_secs(45), async {
        let harness = Harness::start().await;
        replay(harness.fake.replay_url("champ-select-ranked"), &harness.ca).await;
        let mut sets: Value = harness.client.get(SETS).await.expect("item sets");
        let player_set = sets["itemSets"][0].clone();
        // The player's own set, titled like ours.
        let player_ylc_set = json!({ "blocks": [], "title": "YLC Jinx", "uid": "player-ylc" });
        sets["itemSets"]
            .as_array_mut()
            .expect("item set list")
            .push(player_ylc_set.clone());
        harness
            .client
            .put::<IgnoredAny>(SETS, &sets)
            .await
            .expect("player item sets");

        let record = Record::default();
        import(&harness.client, &record, "first-uid").await;
        assert_eq!(
            *record.0.lock().expect("record"),
            Owned {
                rune_page_ids: vec![103],
                item_set_uids: vec!["first-uid".into()],
            }
        );
        let before = harness.requests().await.len();
        import(&harness.client, &record, "second-uid").await;
        let log = harness.requests().await;
        let second = &log[before..];

        assert_eq!(
            writes(second),
            [
                ("DELETE", "/lol-perks/v1/pages/103"),
                ("POST", PAGES),
                ("PATCH", SELECTION),
                ("PUT", SETS),
            ],
            "{second:?}"
        );
        let body_of = |method: &str| {
            let request = second
                .iter()
                .find(|request| request["method"] == method)
                .expect("request of that method");
            request["body"].clone()
        };
        // The fixture has Flash on the first key, the recommendation names it second.
        assert_eq!(body_of("PATCH"), json!({ "spell1Id": FLASH, "spell2Id": IGNITE }));
        let sent = body_of("PUT");
        let sent_sets = sent["itemSets"].as_array().expect("item set list");
        assert_eq!(sent_sets.len(), 3, "{sent}");
        assert_eq!(sent_sets[0], player_set);
        assert_eq!(sent_sets[1], player_ylc_set);
        assert_eq!(sent_sets[2]["uid"], "second-uid");
        assert_eq!(sent["accountId"], sets["accountId"]);

        assert_eq!(harness.page_ids().await, [101, 102, 104]);
        assert_eq!(
            *record.0.lock().expect("record"),
            Owned {
                rune_page_ids: vec![104],
                item_set_uids: vec!["second-uid".into()],
            }
        );
        keep_evidence(
            "import-requests",
            "second import: the fake holds the rune page and item set recorded by the first one, two player rune pages, and two player item sets, one of them titled YLC Jinx",
            second,
        );
        harness.stop().await;
    })
    .await
    .expect("import integration deadline");
}

#[tokio::test]
async fn a_full_inventory_of_player_pages_is_left_untouched() {
    timeout(DEADLINE * 2, async {
        let harness = Harness::start().await;
        // The player fills the last slot with a page named like ours.
        let player_page = json!({
            "current": false,
            "name": "YLC Jinx",
            "primaryStyleId": 8000,
            "selectedPerkIds": [],
            "subStyleId": 8100,
        });
        harness
            .client
            .post::<IgnoredAny>(PAGES, &player_page)
            .await
            .expect("player rune page");
        let before = harness.requests().await.len();

        let record = Record::default();
        let result = import_runes(&harness.client, &record, &page()).await;
        assert!(matches!(result, Err(Error::NoFreePage)), "{result:?}");
        let log = harness.requests().await;
        let attempt = &log[before..];
        assert_eq!(writes(attempt), [], "{attempt:?}");
        assert_eq!(harness.page_ids().await, [101, 102, 103]);
        assert_eq!(*record.0.lock().expect("record"), Owned::default());
        keep_evidence(
            "no-free-page-requests",
            "rune import with every slot taken by a player page, one of them named YLC Jinx and not recorded: NO_FREE_PAGE",
            attempt,
        );
        harness.stop().await;
    })
    .await
    .expect("no free page integration deadline");
}

#[tokio::test]
async fn an_item_set_document_without_its_list_is_not_written_over() {
    timeout(DEADLINE * 2, async {
        let harness = Harness::start().await;
        // What the client holds has no list of item sets at all.
        let incomplete = json!({ "accountId": 123, "timestamp": 42 });
        harness
            .client
            .put::<IgnoredAny>(SETS, &incomplete)
            .await
            .expect("incomplete item sets");
        let before = harness.requests().await.len();

        let record = Record(Mutex::new(Owned {
            item_set_uids: vec!["ours".into()],
            ..Owned::default()
        }));
        let result =
            import_item_set(&harness.client, &record, SUMMONER_ID, &item_set(), "new-uid").await;
        assert!(matches!(result, Err(Error::Json)), "{result:?}");
        let log = harness.requests().await;
        let attempt = &log[before..];
        assert_eq!(writes(attempt), [], "{attempt:?}");
        let held: Value = harness.client.get(SETS).await.expect("item sets");
        assert_eq!(held, incomplete);
        assert_eq!(record.0.lock().expect("record").item_set_uids, ["ours"]);
        keep_evidence(
            "incomplete-item-sets-requests",
            "item set import while the client's document has no itemSets list: refused as invalid LCU JSON, nothing written, record unchanged",
            attempt,
        );
        harness.stop().await;
    })
    .await
    .expect("incomplete item sets integration deadline");
}
