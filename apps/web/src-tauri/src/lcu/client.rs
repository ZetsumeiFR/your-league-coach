use std::{env, fs, io::Cursor, path::Path, sync::Arc, time::Duration};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use reqwest::{Client, Method, StatusCode, header::HeaderValue, redirect::Policy};
use rustls::{ClientConfig, RootCertStore};
use serde::{Serialize, de::DeserializeOwned};

use super::{Error, discovery::Credentials, tls::LoopbackVerifier};

pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(3);

pub fn pinned_tls() -> Result<ClientConfig, Error> {
    let override_path = env::var_os("YLC_RIOT_CA");
    pinned_tls_from(override_path.as_deref().map(Path::new))
}

pub fn pinned_tls_from(override_path: Option<&Path>) -> Result<ClientConfig, Error> {
    let pem = match override_path {
        Some(path) => fs::read(path).map_err(|_| Error::Tls)?,
        None => include_bytes!("../../resources/riotgames.pem").to_vec(),
    };
    let mut roots = RootCertStore::empty();
    for cert in rustls_pemfile::certs(&mut Cursor::new(pem)) {
        roots
            .add(cert.map_err(|_| Error::Tls)?)
            .map_err(|_| Error::Tls)?;
    }
    if roots.is_empty() {
        return Err(Error::Tls);
    }
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let verifier = LoopbackVerifier::new(roots, provider.signature_verification_algorithms);
    Ok(ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|_| Error::Tls)?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(verifier))
        .with_no_client_auth())
}

/// Use this for loopback Riot HTTPS clients (LCU and Live Client Data).
pub fn pinned_http(tls: ClientConfig) -> Result<Client, Error> {
    Client::builder()
        .use_preconfigured_tls(tls)
        .no_proxy()
        .redirect(Policy::none())
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|_| Error::Tls)
}

#[derive(Clone)]
pub struct LcuClient {
    http: Client,
    pub(super) tls: Arc<ClientConfig>,
    pub(super) authorization: HeaderValue,
    pub(super) port: u16,
}

impl LcuClient {
    pub fn new(credentials: Credentials, tls: ClientConfig) -> Result<Self, Error> {
        let port = credentials.port;
        let encoded = STANDARD.encode(format!("riot:{}", credentials.password));
        let mut authorization =
            HeaderValue::from_str(&format!("Basic {encoded}")).map_err(|_| Error::Credentials)?;
        authorization.set_sensitive(true);
        Ok(Self {
            http: pinned_http(tls.clone())?,
            tls: Arc::new(tls),
            authorization,
            port,
        })
    }

    async fn request<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<&(impl Serialize + Sync + ?Sized)>,
    ) -> Result<T, Error> {
        if !path.starts_with('/') {
            return Err(Error::Path);
        }
        let mut request = self
            .http
            .request(method, format!("https://127.0.0.1:{}{path}", self.port))
            .header(reqwest::header::AUTHORIZATION, self.authorization.clone());
        if let Some(body) = body {
            request = request.json(body);
        }
        let response = request.send().await.map_err(|_| Error::Http)?;
        if !response.status().is_success() {
            return Err(Error::HttpStatus(response.status()));
        }
        let bytes = response.bytes().await.map_err(|_| Error::Http)?;
        serde_json::from_slice(if bytes.is_empty() { b"null" } else { &bytes })
            .map_err(|_| Error::Json)
    }

    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, Error> {
        self.request(Method::GET, path, None::<&()>).await
    }

    pub async fn get_optional<T: DeserializeOwned>(&self, path: &str) -> Result<Option<T>, Error> {
        match self.get(path).await {
            Ok(value) => Ok(Some(value)),
            Err(Error::HttpStatus(StatusCode::NOT_FOUND)) => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub async fn post<T: DeserializeOwned>(
        &self,
        path: &str,
        body: &(impl Serialize + Sync + ?Sized),
    ) -> Result<T, Error> {
        self.request(Method::POST, path, Some(body)).await
    }

    pub async fn put<T: DeserializeOwned>(
        &self,
        path: &str,
        body: &(impl Serialize + Sync + ?Sized),
    ) -> Result<T, Error> {
        self.request(Method::PUT, path, Some(body)).await
    }

    pub async fn patch<T: DeserializeOwned>(
        &self,
        path: &str,
        body: &(impl Serialize + Sync + ?Sized),
    ) -> Result<T, Error> {
        self.request(Method::PATCH, path, Some(body)).await
    }

    pub async fn delete<T: DeserializeOwned>(&self, path: &str) -> Result<T, Error> {
        self.request(Method::DELETE, path, None::<&()>).await
    }
}
