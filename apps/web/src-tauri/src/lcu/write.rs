//! Everything the app may change in the League client.
//!
//! A rune page or an item set is replaced or deleted only when the app created
//! it, which the id or uid recorded at creation proves; a name proves nothing.
//! The two summoner spells are set by `lcu_set_spells` alone, which the
//! frontend calls during an import the player asked for.

use std::{collections::BTreeMap, future::Future, sync::Arc};

use reqwest::{Method, StatusCode};
use ring::digest::{SHA256, digest};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{
    Map, Value, json,
    value::{RawValue, to_raw_value},
};
use tauri::{AppHandle, State, Wry};
use tauri_plugin_store::{Store, StoreExt};
use tokio::sync::Mutex;
use uuid::Uuid;

use super::{
    DRAFT_PATH, Error, SUMMONER_PATH,
    client::LcuClient,
    commands::{Identity, LcuState, command_error},
};

const PAGES_PATH: &str = "/lol-perks/v1/pages";
const INVENTORY_PATH: &str = "/lol-perks/v1/inventory";
const SELECTION_PATH: &str = "/lol-champ-select/v1/session/my-selection";
/// The file the settings live in. The frontend neither reads nor writes `OWNED_KEY`.
const STORE_FILE: &str = "settings.json";
const OWNED_KEY: &str = "ylcOwned";
const FLASH: u64 = 4;
// What one import may send. The values come from the coach server and Data
// Dragon and end up in the player's client, so they are bounded here.
const MAX_LABEL_CHARS: usize = 60;
const MAX_PERKS: usize = 12;
const MAX_BLOCKS: usize = 12;
const MAX_BLOCK_ITEMS: usize = 24;
const MAX_ITEM_COUNT: u32 = 9;

/// The League client as the write logic sees it: `LcuClient` in the app, a
/// recorder in tests.
pub trait Lcu: Sync {
    /// Sends one JSON request. An empty answer reads as `null`.
    fn call(
        &self,
        method: Method,
        path: &str,
        body: Option<&RawValue>,
    ) -> impl Future<Output = Result<Box<RawValue>, Error>> + Send;
}

impl Lcu for LcuClient {
    async fn call(
        &self,
        method: Method,
        path: &str,
        body: Option<&RawValue>,
    ) -> Result<Box<RawValue>, Error> {
        self.request(method, path, body).await
    }
}

fn decode<T: DeserializeOwned>(json: &RawValue) -> Result<T, Error> {
    serde_json::from_str(json.get()).map_err(|_| Error::Json)
}

fn encode(value: &impl Serialize) -> Result<Box<RawValue>, Error> {
    to_raw_value(value).map_err(|_| Error::Json)
}

async fn read<T: DeserializeOwned>(lcu: &impl Lcu, path: &str) -> Result<T, Error> {
    decode(&lcu.call(Method::GET, path, None).await?)
}

async fn send(
    lcu: &impl Lcu,
    method: Method,
    path: &str,
    body: &impl Serialize,
) -> Result<Box<RawValue>, Error> {
    lcu.call(method, path, Some(&encode(body)?)).await
}

/// What the app created for one account. Nothing else is replaced or deleted.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Owned {
    pub rune_page_ids: Vec<i64>,
    pub item_set_uids: Vec<String>,
}

/// Where `Owned` is kept for the connected account.
pub trait OwnedStore: Sync {
    /// A record that is missing or unreadable owns nothing.
    fn load(&self) -> Owned;
    fn save(&self, owned: &Owned) -> Result<(), Error>;
}

fn is_label(text: &str) -> bool {
    !text.is_empty()
        && text.trim() == text
        && text.chars().count() <= MAX_LABEL_CHARS
        && !text.chars().any(char::is_control)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunePage {
    name: String,
    primary_style_id: u32,
    sub_style_id: u32,
    selected_perk_ids: Vec<u32>,
}

impl RunePage {
    pub fn new(
        name: String,
        primary_style_id: u32,
        sub_style_id: u32,
        selected_perk_ids: Vec<u32>,
    ) -> Result<Self, Error> {
        let has_two_styles =
            primary_style_id != 0 && sub_style_id != 0 && primary_style_id != sub_style_id;
        let has_perks = (1..=MAX_PERKS).contains(&selected_perk_ids.len())
            && selected_perk_ids.iter().all(|id| *id != 0);
        if !(is_label(&name) && has_two_styles && has_perks) {
            return Err(Error::Input);
        }
        Ok(Self {
            name,
            primary_style_id,
            sub_style_id,
            selected_perk_ids,
        })
    }
}

#[derive(Serialize)]
struct NewPage<'a> {
    #[serde(flatten)]
    page: &'a RunePage,
    current: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Page {
    id: i64,
    is_deletable: Option<bool>,
}

impl Page {
    /// A page the client ships cannot be deleted and takes none of the slots
    /// the inventory counts.
    fn takes_a_slot(&self) -> bool {
        self.is_deletable != Some(false)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Inventory {
    owned_page_count: usize,
}

/// Replaces the pages recorded as ours with `page`, made the current one.
/// `Error::NoFreePage` when every slot holds a page that is not ours: no page
/// is deleted then.
pub async fn import_runes(
    lcu: &impl Lcu,
    store: &impl OwnedStore,
    page: &RunePage,
) -> Result<(), Error> {
    let pages: Vec<Page> = read(lcu, PAGES_PATH).await?;
    let mut owned = store.load();
    let recorded = owned.rune_page_ids.len();
    owned
        .rune_page_ids
        .retain(|id| pages.iter().any(|page| page.id == *id));
    if owned.rune_page_ids.len() != recorded {
        store.save(&owned)?;
    }
    let replaced = owned.rune_page_ids.clone();
    for id in &replaced {
        let deleted = lcu
            .call(Method::DELETE, &format!("{PAGES_PATH}/{id}"), None)
            .await;
        match deleted {
            // Already gone: its slot is free either way.
            Ok(_) | Err(Error::HttpStatus(StatusCode::NOT_FOUND)) => {}
            Err(error) => return Err(error),
        }
        // Saved page by page, so the record never names a page this run deleted.
        owned.rune_page_ids.retain(|kept| kept != id);
        store.save(&owned)?;
    }
    let inventory: Inventory = read(lcu, INVENTORY_PATH).await?;
    let used = pages
        .iter()
        .filter(|page| page.takes_a_slot() && !replaced.contains(&page.id))
        .count();
    if used >= inventory.owned_page_count {
        return Err(Error::NoFreePage);
    }
    let new_page = NewPage {
        page,
        current: true,
    };
    let created: Page = decode(&send(lcu, Method::POST, PAGES_PATH, &new_page).await?)?;
    owned.rune_page_ids.push(created.id);
    store.save(&owned)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Draft {
    local_player_cell_id: i64,
    my_team: Vec<Member>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Member {
    cell_id: i64,
    #[serde(default)]
    spell1_id: u64,
    #[serde(default)]
    spell2_id: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Selection {
    spell1_id: u64,
    spell2_id: u64,
}

/// Flash stays on the key the player has it on. When either side has no
/// Flash, the recommended order stands.
fn keep_flash_key(recommended: [u64; 2], current: Option<[u64; 2]>) -> [u64; 2] {
    let other = match recommended {
        [FLASH, other] | [other, FLASH] => other,
        _ => return recommended,
    };
    match current {
        Some([FLASH, _]) => [FLASH, other],
        Some([_, FLASH]) => [other, FLASH],
        _ => recommended,
    }
}

/// Sets the local player's two summoner spells. Fails outside champion select,
/// where the client has no session to read the current keys from.
pub async fn set_spells(lcu: &impl Lcu, recommended: [u64; 2]) -> Result<(), Error> {
    let [first, second] = recommended;
    if first == 0 || second == 0 || first == second {
        return Err(Error::Input);
    }
    let draft: Draft = read(lcu, DRAFT_PATH).await?;
    let current = draft
        .my_team
        .iter()
        .find(|member| member.cell_id == draft.local_player_cell_id)
        .map(|member| [member.spell1_id, member.spell2_id]);
    let [spell1_id, spell2_id] = keep_flash_key(recommended, current);
    let selection = Selection {
        spell1_id,
        spell2_id,
    };
    send(lcu, Method::PATCH, SELECTION_PATH, &selection).await?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct BlockItem {
    pub id: u32,
    pub count: u32,
}

/// One titled group of items in the in-game shop.
#[derive(Debug, Deserialize)]
pub struct Block {
    #[serde(rename = "type")]
    pub title: String,
    pub items: Vec<BlockItem>,
}

impl Block {
    fn is_valid(&self) -> bool {
        is_label(&self.title)
            && (1..=MAX_BLOCK_ITEMS).contains(&self.items.len())
            && self
                .items
                .iter()
                .all(|item| item.id != 0 && (1..=MAX_ITEM_COUNT).contains(&item.count))
    }
}

#[derive(Debug)]
pub struct ItemSet {
    champion_id: u32,
    title: String,
    blocks: Vec<Block>,
}

impl ItemSet {
    pub fn new(champion_id: u32, title: String, blocks: Vec<Block>) -> Result<Self, Error> {
        let has_blocks =
            (1..=MAX_BLOCKS).contains(&blocks.len()) && blocks.iter().all(Block::is_valid);
        if !(champion_id != 0 && is_label(&title) && has_blocks) {
            return Err(Error::Input);
        }
        Ok(Self {
            champion_id,
            title,
            blocks,
        })
    }

    /// The set as the client stores it, shown for its champion on every map.
    fn to_client(&self, uid: &str) -> Value {
        let blocks: Vec<Value> = self
            .blocks
            .iter()
            .map(|block| {
                let items: Vec<Value> = block
                    .items
                    .iter()
                    .map(|item| json!({ "count": item.count, "id": item.id.to_string() }))
                    .collect();
                json!({
                    "hideIfSummonerSpell": "",
                    "items": items,
                    "showIfSummonerSpell": "",
                    "type": block.title,
                })
            })
            .collect();
        json!({
            "associatedChampions": [self.champion_id],
            "associatedMaps": [],
            "blocks": blocks,
            "map": "any",
            "mode": "any",
            "preferredItemSlots": [],
            "sortrank": 0,
            "startedFrom": "blank",
            "title": self.title,
            "type": "custom",
            "uid": uid,
        })
    }
}

#[derive(Deserialize)]
struct Identified {
    uid: String,
}

fn uid_of(set: &RawValue) -> Option<String> {
    serde_json::from_str::<Identified>(set.get())
        .ok()
        .map(|set| set.uid)
}

/// Writes the player's item sets back with `set` in place of the sets recorded
/// as ours. Every other set, and every other field of the document, goes back
/// as the exact text the client sent.
pub async fn import_item_set(
    lcu: &impl Lcu,
    store: &impl OwnedStore,
    summoner_id: u64,
    set: &ItemSet,
    uid: &str,
) -> Result<(), Error> {
    let path = format!("/lol-item-sets/v1/item-sets/{summoner_id}/sets");
    let mut document: BTreeMap<String, Box<RawValue>> = read(lcu, &path).await?;
    let sets: Vec<Box<RawValue>> = match document.get("itemSets") {
        Some(sets) => decode(sets)?,
        None => Vec::new(),
    };
    let mut owned = store.load();
    let mut replaced = Vec::new();
    let mut kept = Vec::with_capacity(sets.len() + 1);
    for existing in sets {
        match uid_of(&existing).filter(|uid| owned.item_set_uids.contains(uid)) {
            Some(uid) => replaced.push(uid),
            None => kept.push(existing),
        }
    }
    kept.push(encode(&set.to_client(uid))?);
    document.insert("itemSets".into(), encode(&kept)?);
    // The record is saved before the write. If the write fails, the old sets
    // are still in the client and still recorded as ours, and the uid that
    // never arrived is dropped by the next import.
    replaced.push(uid.into());
    owned.item_set_uids = replaced;
    store.save(&owned)?;
    send(lcu, Method::PUT, &path, &document).await?;
    owned.item_set_uids = vec![uid.into()];
    store.save(&owned)
}

/// One write command at a time: two overlapping imports would act on the same
/// recorded ids.
#[derive(Default)]
pub struct WriteLock(Mutex<()>);

/// Accounts are told apart by the hash of their PUUID, so the file names none.
fn account_key(puuid: &str) -> String {
    digest(&SHA256, puuid.as_bytes())
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

struct AccountRecord {
    store: Arc<Store<Wry>>,
    account: String,
}

impl OwnedStore for AccountRecord {
    fn load(&self) -> Owned {
        self.store
            .get(OWNED_KEY)
            .and_then(|accounts| accounts.get(&self.account).cloned())
            .and_then(|owned| serde_json::from_value(owned).ok())
            .unwrap_or_default()
    }

    fn save(&self, owned: &Owned) -> Result<(), Error> {
        let mut accounts = match self.store.get(OWNED_KEY) {
            Some(Value::Object(accounts)) => accounts,
            _ => Map::new(),
        };
        let owned = serde_json::to_value(owned).map_err(|_| Error::Store)?;
        accounts.insert(self.account.clone(), owned);
        self.store.set(OWNED_KEY, Value::Object(accounts));
        self.store.save().map_err(|_| Error::Store)
    }
}

async fn connected_account(
    app: &AppHandle,
    client: &LcuClient,
) -> Result<(AccountRecord, u64), Error> {
    let identity: Identity = client.get(SUMMONER_PATH).await?;
    let record = AccountRecord {
        store: app.store(STORE_FILE).map_err(|_| Error::Store)?,
        account: account_key(&identity.puuid),
    };
    Ok((record, identity.summoner_id))
}

#[tauri::command]
pub async fn lcu_import_runes(
    app: AppHandle,
    state: State<'_, LcuState>,
    lock: State<'_, WriteLock>,
    name: String,
    primary_style_id: u32,
    sub_style_id: u32,
    selected_perk_ids: Vec<u32>,
) -> Result<(), String> {
    let page = RunePage::new(name, primary_style_id, sub_style_id, selected_perk_ids)
        .map_err(command_error)?;
    let client = state.client().map_err(command_error)?;
    let _writing = lock.0.lock().await;
    let (record, _) = connected_account(&app, &client)
        .await
        .map_err(command_error)?;
    import_runes(&client, &record, &page)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn lcu_set_spells(
    state: State<'_, LcuState>,
    lock: State<'_, WriteLock>,
    spell1_id: u64,
    spell2_id: u64,
) -> Result<(), String> {
    let client = state.client().map_err(command_error)?;
    let _writing = lock.0.lock().await;
    set_spells(&client, [spell1_id, spell2_id])
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn lcu_import_item_set(
    app: AppHandle,
    state: State<'_, LcuState>,
    lock: State<'_, WriteLock>,
    champion_id: u32,
    title: String,
    blocks: Vec<Block>,
) -> Result<(), String> {
    let set = ItemSet::new(champion_id, title, blocks).map_err(command_error)?;
    let client = state.client().map_err(command_error)?;
    let _writing = lock.0.lock().await;
    let (record, summoner_id) = connected_account(&app, &client)
        .await
        .map_err(command_error)?;
    let uid = Uuid::new_v4().to_string();
    import_item_set(&client, &record, summoner_id, &set, &uid)
        .await
        .map_err(command_error)
}

#[cfg(test)]
mod tests {
    use std::sync::{
        Mutex as StdMutex,
        atomic::{AtomicBool, Ordering},
    };

    use super::*;

    const SETS_PATH: &str = "/lol-item-sets/v1/item-sets/123/sets";
    /// Spacing and key order no serializer would produce, to show what goes
    /// back is the client's own text.
    const PLAYER_SET: &str =
        r#"{"uid":"player-set","title":"Mine","blocks":[], "extra" : {"z":1,"a":2}}"#;
    /// Created by the player and titled like ours: its uid was never recorded.
    const PLAYER_YLC_SET: &str =
        r#"{ "title":"YLC Jinx","uid":"player-ylc" ,"associatedChampions":[222]}"#;
    const OUR_SET: &str = r#"{"uid":"ours","title":"YLC Ahri","blocks":[]}"#;

    #[derive(Clone, Debug, PartialEq)]
    struct Request {
        method: Method,
        path: String,
        body: Option<String>,
    }

    #[derive(Default)]
    struct ClientState {
        pages: Vec<Value>,
        slots: usize,
        next_page_id: i64,
        sets: String,
        draft: Option<String>,
        /// Requests of this method are answered with this status.
        failing: Option<(Method, StatusCode)>,
        requests: Vec<Request>,
    }

    struct Client(StdMutex<ClientState>);

    impl Client {
        fn with_pages(pages: &[(i64, &str)], slots: usize) -> Self {
            Self(StdMutex::new(ClientState {
                pages: pages
                    .iter()
                    .map(|(id, name)| json!({ "id": id, "isDeletable": true, "name": name }))
                    .collect(),
                slots,
                next_page_id: 104,
                ..ClientState::default()
            }))
        }

        fn with_sets(sets: &[&str]) -> Self {
            Self(StdMutex::new(ClientState {
                sets: format!(
                    r#"{{"accountId":123,"itemSets":[{}],"timestamp":42}}"#,
                    sets.join(",")
                ),
                ..ClientState::default()
            }))
        }

        fn in_champion_select(local_spells: [u64; 2]) -> Self {
            let [spell1, spell2] = local_spells;
            let draft = json!({
                "localPlayerCellId": 2,
                "myTeam": [
                    { "cellId": 0, "spell1Id": 12, "spell2Id": 4 },
                    { "cellId": 2, "spell1Id": spell1, "spell2Id": spell2 },
                ],
            });
            Self(StdMutex::new(ClientState {
                draft: Some(draft.to_string()),
                ..ClientState::default()
            }))
        }

        fn state(&self) -> std::sync::MutexGuard<'_, ClientState> {
            self.0.lock().expect("client state")
        }

        fn fail(&self, method: Method, status: StatusCode) {
            self.state().failing = Some((method, status));
        }

        fn recover(&self) {
            self.state().failing = None;
        }

        fn page_ids(&self) -> Vec<i64> {
            self.state()
                .pages
                .iter()
                .filter_map(|page| page["id"].as_i64())
                .collect()
        }

        /// Every request that changes the client, as "METHOD path".
        fn writes(&self) -> Vec<String> {
            self.state()
                .requests
                .iter()
                .filter(|request| request.method != Method::GET)
                .map(|request| format!("{} {}", request.method, request.path))
                .collect()
        }

        fn last_body(&self) -> String {
            let state = self.state();
            let last = state.requests.last().expect("a request");
            last.body.clone().expect("a request body")
        }
    }

    impl ClientState {
        fn answer(
            &mut self,
            method: &Method,
            path: &str,
            body: Option<&str>,
        ) -> Result<String, Error> {
            let missing = Error::HttpStatus(StatusCode::NOT_FOUND);
            match (method.as_str(), path) {
                ("GET", PAGES_PATH) => Ok(Value::Array(self.pages.clone()).to_string()),
                ("GET", INVENTORY_PATH) => Ok(json!({ "ownedPageCount": self.slots }).to_string()),
                ("POST", PAGES_PATH) => {
                    let mut page: Value =
                        serde_json::from_str(body.expect("page body")).expect("page JSON");
                    page["id"] = json!(self.next_page_id);
                    self.next_page_id += 1;
                    self.pages.push(page.clone());
                    Ok(page.to_string())
                }
                ("DELETE", PAGES_PATH) => panic!("the app must never delete every page"),
                ("DELETE", path) => {
                    let id = path
                        .strip_prefix("/lol-perks/v1/pages/")
                        .and_then(|id| id.parse::<i64>().ok())
                        .expect("a rune page path");
                    let before = self.pages.len();
                    self.pages.retain(|page| page["id"] != json!(id));
                    if self.pages.len() == before {
                        return Err(missing);
                    }
                    Ok("null".into())
                }
                ("GET", SETS_PATH) => Ok(self.sets.clone()),
                ("PUT", SETS_PATH) => {
                    self.sets = body.expect("item sets body").into();
                    Ok("null".into())
                }
                ("GET", DRAFT_PATH) => self.draft.clone().ok_or(missing),
                ("PATCH", SELECTION_PATH) => Ok("null".into()),
                _ => Err(missing),
            }
        }
    }

    impl Lcu for Client {
        async fn call(
            &self,
            method: Method,
            path: &str,
            body: Option<&RawValue>,
        ) -> Result<Box<RawValue>, Error> {
            let body = body.map(RawValue::get);
            let mut state = self.state();
            state.requests.push(Request {
                method: method.clone(),
                path: path.into(),
                body: body.map(Into::into),
            });
            if let Some((_, status)) = state
                .failing
                .as_ref()
                .filter(|(failing, _)| *failing == method)
            {
                return Err(Error::HttpStatus(*status));
            }
            let answer = state.answer(&method, path, body)?;
            RawValue::from_string(answer).map_err(|_| Error::Json)
        }
    }

    #[derive(Default)]
    struct Record {
        owned: StdMutex<Owned>,
        failing: AtomicBool,
    }

    impl Record {
        fn of(rune_page_ids: &[i64], item_set_uids: &[&str]) -> Self {
            Self {
                owned: StdMutex::new(Owned {
                    rune_page_ids: rune_page_ids.into(),
                    item_set_uids: item_set_uids.iter().map(|uid| (*uid).into()).collect(),
                }),
                failing: AtomicBool::new(false),
            }
        }
    }

    impl OwnedStore for Record {
        fn load(&self) -> Owned {
            self.owned.lock().expect("record").clone()
        }

        fn save(&self, owned: &Owned) -> Result<(), Error> {
            if self.failing.load(Ordering::Relaxed) {
                return Err(Error::Store);
            }
            *self.owned.lock().expect("record") = owned.clone();
            Ok(())
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
        let block = Block {
            title: "Core".into(),
            items: vec![BlockItem { id: 6655, count: 1 }],
        };
        ItemSet::new(103, "YLC Ahri".into(), vec![block]).expect("valid item set")
    }

    #[tokio::test]
    async fn leaves_the_players_pages_alone_and_records_the_page_it_creates() {
        let client = Client::with_pages(&[(101, "Mine"), (102, "Also mine")], 3);
        let record = Record::default();
        import_runes(&client, &record, &page())
            .await
            .expect("a free slot");
        assert_eq!(client.writes(), ["POST /lol-perks/v1/pages"]);
        let created: Value = serde_json::from_str(&client.last_body()).expect("page JSON");
        assert_eq!(
            created,
            json!({
                "current": true,
                "name": "YLC Ahri",
                "primaryStyleId": 8100,
                "selectedPerkIds": [8112, 8139, 8140, 8135, 8226, 8210, 5008, 5008, 5011],
                "subStyleId": 8200,
            })
        );
        assert_eq!(client.page_ids(), [101, 102, 104]);
        assert_eq!(record.load().rune_page_ids, [104]);
    }

    #[tokio::test]
    async fn replaces_only_the_page_it_recorded() {
        let client = Client::with_pages(&[(101, "Mine"), (102, "YLC Jinx"), (103, "YLC Ahri")], 3);
        let record = Record::of(&[103], &[]);
        import_runes(&client, &record, &page())
            .await
            .expect("our own slot");
        assert_eq!(
            client.writes(),
            ["DELETE /lol-perks/v1/pages/103", "POST /lol-perks/v1/pages"]
        );
        assert_eq!(client.page_ids(), [101, 102, 104]);
        assert_eq!(record.load().rune_page_ids, [104]);
    }

    #[tokio::test]
    async fn a_full_inventory_of_player_pages_is_reported_and_nothing_is_deleted() {
        // Page 103 is the player's own, named like ours; 999 is a record of a page long gone.
        let client = Client::with_pages(&[(101, "Mine"), (102, "Mine"), (103, "YLC Jinx")], 3);
        let record = Record::of(&[999], &[]);
        let result = import_runes(&client, &record, &page()).await;
        assert!(matches!(result, Err(Error::NoFreePage)), "{result:?}");
        assert_eq!(client.writes(), [] as [&str; 0]);
        assert_eq!(client.page_ids(), [101, 102, 103]);
        assert_eq!(record.load().rune_page_ids, [] as [i64; 0]);
    }

    #[tokio::test]
    async fn forgets_a_recorded_page_the_player_deleted() {
        let client = Client::with_pages(&[(101, "Mine"), (103, "YLC Ahri")], 2);
        let record = Record::of(&[50, 103], &[]);
        import_runes(&client, &record, &page())
            .await
            .expect("our own slot");
        assert_eq!(
            client.writes(),
            ["DELETE /lol-perks/v1/pages/103", "POST /lol-perks/v1/pages"]
        );
        assert_eq!(record.load().rune_page_ids, [104]);
    }

    #[tokio::test]
    async fn an_interrupted_import_leaves_a_record_that_matches_the_client() {
        let client = Client::with_pages(&[(101, "Mine"), (103, "YLC Ahri")], 2);
        let record = Record::of(&[103], &[]);

        client.fail(Method::DELETE, StatusCode::INTERNAL_SERVER_ERROR);
        let refused = import_runes(&client, &record, &page()).await;
        assert!(matches!(refused, Err(Error::HttpStatus(_))), "{refused:?}");
        assert_eq!(client.page_ids(), [101, 103]);
        assert_eq!(record.load().rune_page_ids, [103]);

        client.fail(Method::POST, StatusCode::INTERNAL_SERVER_ERROR);
        let cut_short = import_runes(&client, &record, &page()).await;
        assert!(
            matches!(cut_short, Err(Error::HttpStatus(_))),
            "{cut_short:?}"
        );
        assert_eq!(client.page_ids(), [101]);
        assert_eq!(record.load().rune_page_ids, [] as [i64; 0]);

        client.recover();
        import_runes(&client, &record, &page())
            .await
            .expect("a free slot");
        assert_eq!(client.page_ids(), [101, 104]);
        assert_eq!(record.load().rune_page_ids, [104]);
    }

    #[tokio::test]
    async fn a_recorded_page_that_vanished_meanwhile_is_not_an_error() {
        let client = Client::with_pages(&[(101, "Mine"), (103, "YLC Ahri")], 2);
        let record = Record::of(&[103], &[]);
        client.fail(Method::DELETE, StatusCode::NOT_FOUND);
        import_runes(&client, &record, &page())
            .await
            .expect("the slot of the vanished page");
        assert_eq!(record.load().rune_page_ids, [104]);
    }

    #[tokio::test]
    async fn a_page_it_could_not_record_is_never_deleted_later() {
        let client = Client::with_pages(&[(101, "Mine")], 3);
        let record = Record::default();
        record.failing.store(true, Ordering::Relaxed);
        let unrecorded = import_runes(&client, &record, &page()).await;
        assert!(matches!(unrecorded, Err(Error::Store)), "{unrecorded:?}");
        assert_eq!(client.page_ids(), [101, 104]);

        record.failing.store(false, Ordering::Relaxed);
        import_runes(&client, &record, &page())
            .await
            .expect("a free slot");
        assert_eq!(
            client.writes(),
            ["POST /lol-perks/v1/pages", "POST /lol-perks/v1/pages"]
        );
        assert_eq!(client.page_ids(), [101, 104, 105]);
    }

    #[tokio::test]
    async fn replaces_its_own_item_set_and_sends_every_other_one_back_untouched() {
        let client = Client::with_sets(&[PLAYER_SET, PLAYER_YLC_SET, OUR_SET]);
        let record = Record::of(&[], &["ours", "gone"]);
        import_item_set(&client, &record, 123, &item_set(), "new-uid")
            .await
            .expect("item sets written");
        assert_eq!(client.writes(), [format!("PUT {SETS_PATH}")]);
        let body = client.last_body();
        assert!(
            body.starts_with(&format!(
                r#"{{"accountId":123,"itemSets":[{PLAYER_SET},{PLAYER_YLC_SET},{{"#
            )),
            "{body}"
        );
        assert!(body.ends_with(r#"],"timestamp":42}"#), "{body}");
        assert!(!body.contains(r#""ours""#), "{body}");
        let sent: Value = serde_json::from_str(&body).expect("item sets JSON");
        assert_eq!(
            sent["itemSets"][2],
            json!({
                "associatedChampions": [103],
                "associatedMaps": [],
                "blocks": [{
                    "hideIfSummonerSpell": "",
                    "items": [{ "count": 1, "id": "6655" }],
                    "showIfSummonerSpell": "",
                    "type": "Core",
                }],
                "map": "any",
                "mode": "any",
                "preferredItemSlots": [],
                "sortrank": 0,
                "startedFrom": "blank",
                "title": "YLC Ahri",
                "type": "custom",
                "uid": "new-uid",
            })
        );
        assert_eq!(record.load().item_set_uids, ["new-uid"]);
    }

    #[tokio::test]
    async fn a_failed_item_set_write_is_repaired_by_the_next_import() {
        let client = Client::with_sets(&[PLAYER_SET, OUR_SET]);
        let record = Record::of(&[], &["ours"]);
        client.fail(Method::PUT, StatusCode::INTERNAL_SERVER_ERROR);
        let refused = import_item_set(&client, &record, 123, &item_set(), "lost-uid").await;
        assert!(matches!(refused, Err(Error::HttpStatus(_))), "{refused:?}");
        // Our old set is still in the client, so it must still be recorded.
        assert_eq!(record.load().item_set_uids, ["ours", "lost-uid"]);

        client.recover();
        import_item_set(&client, &record, 123, &item_set(), "new-uid")
            .await
            .expect("item sets written");
        let body = client.last_body();
        assert!(body.contains(PLAYER_SET), "{body}");
        assert!(!body.contains(r#""ours""#), "{body}");
        assert!(!body.contains("lost-uid"), "{body}");
        assert_eq!(record.load().item_set_uids, ["new-uid"]);
    }

    #[tokio::test]
    async fn an_answer_it_cannot_read_changes_nothing() {
        let record = Record::of(&[103], &["ours"]);
        let pages = Client::with_pages(&[(103, "YLC Ahri")], 2);
        pages.state().pages.push(json!({ "name": "No id" }));
        let result = import_runes(&pages, &record, &page()).await;
        assert!(matches!(result, Err(Error::Json)), "{result:?}");
        assert_eq!(pages.writes(), [] as [&str; 0]);

        for sets in ["[]", r#"{"accountId":123,"itemSets":{"uid":"ours"}}"#] {
            let client = Client(StdMutex::new(ClientState {
                sets: sets.into(),
                ..ClientState::default()
            }));
            let result = import_item_set(&client, &record, 123, &item_set(), "new-uid").await;
            assert!(matches!(result, Err(Error::Json)), "{sets} {result:?}");
            assert_eq!(client.writes(), [] as [&str; 0]);
        }
        assert_eq!(
            record.load(),
            Owned {
                rune_page_ids: vec![103],
                item_set_uids: vec!["ours".into()],
            }
        );
    }

    #[test]
    fn flash_stays_on_the_key_the_player_has_it_on() {
        const IGNITE: u64 = 14;
        const TELEPORT: u64 = 12;
        for (recommended, current, expected) in [
            ([FLASH, IGNITE], Some([IGNITE, FLASH]), [IGNITE, FLASH]),
            ([IGNITE, FLASH], Some([FLASH, TELEPORT]), [FLASH, IGNITE]),
            ([FLASH, IGNITE], Some([FLASH, TELEPORT]), [FLASH, IGNITE]),
            // No Flash to keep in place on one side or the other.
            ([IGNITE, FLASH], Some([TELEPORT, IGNITE]), [IGNITE, FLASH]),
            (
                [IGNITE, TELEPORT],
                Some([TELEPORT, FLASH]),
                [IGNITE, TELEPORT],
            ),
            ([FLASH, IGNITE], None, [FLASH, IGNITE]),
        ] {
            assert_eq!(
                keep_flash_key(recommended, current),
                expected,
                "{recommended:?} over {current:?}"
            );
        }
    }

    #[tokio::test]
    async fn sets_the_local_players_spells_with_one_request() {
        let client = Client::in_champion_select([14, FLASH]);
        set_spells(&client, [FLASH, 12]).await.expect("spells set");
        assert_eq!(
            client.writes(),
            ["PATCH /lol-champ-select/v1/session/my-selection"]
        );
        assert_eq!(client.last_body(), r#"{"spell1Id":12,"spell2Id":4}"#);
    }

    #[tokio::test]
    async fn sets_no_spell_outside_champion_select() {
        let client = Client::with_pages(&[], 2);
        let result = set_spells(&client, [FLASH, 14]).await;
        assert!(
            matches!(result, Err(Error::HttpStatus(StatusCode::NOT_FOUND))),
            "{result:?}"
        );
        assert_eq!(client.writes(), [] as [&str; 0]);
    }

    #[tokio::test]
    async fn refuses_requests_that_are_not_a_build() {
        let perks = || vec![8112, 8139];
        for (name, primary, sub, perks) in [
            ("", 8100, 8200, perks()),
            (" YLC Ahri", 8100, 8200, perks()),
            ("YLC\nAhri", 8100, 8200, perks()),
            ("YLC Ahri", 0, 8200, perks()),
            ("YLC Ahri", 8100, 8100, perks()),
            ("YLC Ahri", 8100, 8200, vec![]),
            ("YLC Ahri", 8100, 8200, vec![8112, 0]),
            ("YLC Ahri", 8100, 8200, vec![1; MAX_PERKS + 1]),
        ] {
            let page = RunePage::new(name.into(), primary, sub, perks);
            assert!(matches!(page, Err(Error::Input)), "{name:?} {page:?}");
        }
        let block = |title: &str, id, count| Block {
            title: title.into(),
            items: vec![BlockItem { id, count }],
        };
        for (champion, title, blocks) in [
            (0, "YLC Ahri", vec![block("Core", 6655, 1)]),
            (
                103,
                "x".repeat(MAX_LABEL_CHARS + 1).as_str(),
                vec![block("Core", 6655, 1)],
            ),
            (103, "YLC Ahri", vec![]),
            (103, "YLC Ahri", vec![block("", 6655, 1)]),
            (103, "YLC Ahri", vec![block("Core", 0, 1)]),
            (103, "YLC Ahri", vec![block("Core", 6655, 0)]),
            (
                103,
                "YLC Ahri",
                vec![block("Core", 6655, MAX_ITEM_COUNT + 1)],
            ),
        ] {
            let set = ItemSet::new(champion, title.into(), blocks);
            assert!(matches!(set, Err(Error::Input)), "{title:?} {set:?}");
        }
        let client = Client::in_champion_select([FLASH, 14]);
        for spells in [[FLASH, FLASH], [0, FLASH]] {
            let result = set_spells(&client, spells).await;
            assert!(matches!(result, Err(Error::Input)), "{spells:?} {result:?}");
        }
        assert_eq!(client.state().requests, []);
    }

    #[test]
    fn reads_the_blocks_the_frontend_sends() {
        let blocks: Vec<Block> = serde_json::from_value(json!([
            { "type": "Start", "items": [{ "count": 2, "id": 2003 }] },
        ]))
        .expect("frontend blocks");
        let set = ItemSet::new(103, "YLC Ahri".into(), blocks).expect("valid item set");
        assert_eq!(
            set.to_client("uid")["blocks"],
            json!([{
                "hideIfSummonerSpell": "",
                "items": [{ "count": 2, "id": "2003" }],
                "showIfSummonerSpell": "",
                "type": "Start",
            }])
        );
    }

    #[test]
    fn accounts_are_told_apart_by_the_hash_of_their_puuid() {
        assert_eq!(
            account_key("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_ne!(account_key("abc"), account_key("abd"));
    }
}
