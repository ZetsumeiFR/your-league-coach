use futures_util::SinkExt;
use serde::Deserialize;
use serde_json::Value;
use tokio::{net::TcpStream, time::timeout};
use tokio_tungstenite::{
    Connector, MaybeTlsStream, WebSocketStream, connect_async_tls_with_config,
    tungstenite::{Error as WsError, Message, client::IntoClientRequest},
};

use super::{
    Error,
    client::{LcuClient, REQUEST_TIMEOUT},
};

const CHAMP_SELECT: &str = "OnJsonApiEvent_lol-champ-select_v1_session";
const PHASE: &str = "OnJsonApiEvent_lol-gameflow_v1_gameflow-phase";
const GAMEFLOW: &str = "OnJsonApiEvent_lol-gameflow_v1_session";

pub(super) type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub(super) async fn subscribe(client: &LcuClient) -> Result<Socket, Error> {
    let mut request = format!("wss://127.0.0.1:{}/", client.port)
        .into_client_request()
        .map_err(|_| Error::Socket)?;
    request
        .headers_mut()
        .insert("authorization", client.authorization.clone());
    timeout(REQUEST_TIMEOUT, async {
        let (mut socket, _) = connect_async_tls_with_config(
            request,
            None,
            false,
            Some(Connector::Rustls(client.tls.clone())),
        )
        .await
        .map_err(|error| match error {
            WsError::Tls(_) => Error::Tls,
            WsError::Io(ref io) if io.kind() == std::io::ErrorKind::InvalidData => Error::Tls,
            _ => Error::Socket,
        })?;
        for topic in [CHAMP_SELECT, PHASE, GAMEFLOW] {
            socket
                .send(Message::text(serde_json::json!([5, topic]).to_string()))
                .await
                .map_err(|_| Error::Socket)?;
        }
        Ok(socket)
    })
    .await
    .map_err(|_| Error::Socket)?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Envelope {
    data: Value,
    event_type: EventType,
    uri: String,
}

#[derive(Deserialize, PartialEq)]
enum EventType {
    Create,
    Update,
    Delete,
}

pub(super) enum Event {
    Draft(Value),
    Phase(Value),
    Gameflow(Value),
    Ignore,
}

pub(super) fn parse(text: &str) -> Result<Event, Error> {
    let (code, topic, envelope): (u8, &str, Envelope) =
        serde_json::from_str(text).map_err(|_| Error::Wamp)?;
    if code != 8 {
        return Err(Error::Wamp);
    }
    if envelope.event_type == EventType::Delete {
        return Ok(Event::Ignore);
    }
    Ok(match (topic, envelope.uri.as_str()) {
        (CHAMP_SELECT, super::DRAFT_PATH) => Event::Draft(envelope.data),
        (PHASE, super::PHASE_PATH) => Event::Phase(envelope.data),
        (GAMEFLOW, super::GAMEFLOW_PATH) => Event::Gameflow(envelope.data),
        _ => Event::Ignore,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wamp_checks_the_frame_and_routes_only_expected_topics() {
        let frame = serde_json::json!([8, CHAMP_SELECT, {
            "data": {"localPlayerCellId": 2}, "eventType":"Update", "uri":super::super::DRAFT_PATH
        }]);
        assert!(
            matches!(parse(&frame.to_string()), Ok(Event::Draft(data)) if data["localPlayerCellId"] == 2)
        );
        for invalid in [
            "",
            "[8,",
            "[8,\"topic\",{}]",
            "[8,\"topic\",null]",
            "[5,\"topic\",{\"data\":null,\"eventType\":\"Delete\",\"uri\":\"/\"}]",
        ] {
            assert!(parse(invalid).is_err());
        }
    }
}
