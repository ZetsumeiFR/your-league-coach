use std::{net::Ipv4Addr, sync::Arc};

use rustls::{
    CertificateError, DigitallySignedStruct, Error, RootCertStore, SignatureScheme,
    client::{
        VerifierBuilderError, WebPkiServerVerifier,
        danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
        verify_server_cert_signed_by_trust_anchor,
    },
    crypto::{CryptoProvider, WebPkiSupportedAlgorithms},
    pki_types::{CertificateDer, ServerName, UnixTime},
    server::ParsedCertificate,
};
use x509_parser::{oid_registry::OID_X509_EXT_SUBJECT_ALT_NAME, parse_x509_certificate};

#[derive(Debug)]
pub(super) struct LoopbackVerifier {
    standard: Arc<WebPkiServerVerifier>,
    roots: Arc<RootCertStore>,
    algorithms: WebPkiSupportedAlgorithms,
}

impl LoopbackVerifier {
    pub(super) fn new(
        roots: RootCertStore,
        provider: Arc<CryptoProvider>,
    ) -> Result<Self, VerifierBuilderError> {
        let roots = Arc::new(roots);
        let algorithms = provider.signature_verification_algorithms;
        let standard =
            WebPkiServerVerifier::builder_with_provider(roots.clone(), provider).build()?;
        Ok(Self {
            standard,
            roots,
            algorithms,
        })
    }
}

fn has_legacy_loopback_identity(leaf: &CertificateDer<'_>) -> bool {
    let Ok(([], cert)) = parse_x509_certificate(leaf.as_ref()) else {
        return false;
    };
    if cert
        .extensions()
        .iter()
        .any(|ext| ext.oid == OID_X509_EXT_SUBJECT_ALT_NAME)
    {
        return false;
    }
    let mut common_names = cert.subject().iter_common_name();
    common_names
        .next()
        .is_some_and(|cn| cn.as_str() == Ok("127.0.0.1"))
        && common_names.next().is_none()
}

impl ServerCertVerifier for LoopbackVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        ocsp_response: &[u8],
        now: UnixTime,
    ) -> Result<ServerCertVerified, Error> {
        let result = self.standard.verify_server_cert(
            end_entity,
            intermediates,
            server_name,
            ocsp_response,
            now,
        );
        if !matches!(
            result,
            Err(Error::InvalidCertificate(
                CertificateError::NotValidForName | CertificateError::NotValidForNameContext { .. }
            ))
        ) || *server_name != ServerName::IpAddress(Ipv4Addr::LOCALHOST.into())
            || !has_legacy_loopback_identity(end_entity)
        {
            return result;
        }

        // Rustls delegates this to WebPKI verify_for_usage with server_auth.
        // Only the name check is replaced by the exact legacy identity above.
        let cert = ParsedCertificate::try_from(end_entity)?;
        verify_server_cert_signed_by_trust_anchor(
            &cert,
            &self.roots,
            intermediates,
            now,
            self.algorithms.all,
        )?;

        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        self.standard
            .verify_tls12_signature(message, cert, signature)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        self.standard
            .verify_tls13_signature(message, cert, signature)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.standard.supported_verify_schemes()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustls::pki_types::pem::PemObject;
    use std::{fs, path::Path, time::Duration};
    use tokio::{process::Command, time::timeout};

    async fn run(command: &mut Command) {
        let status = timeout(Duration::from_secs(15), command.kill_on_drop(true).status())
            .await
            .expect("certificate command deadline")
            .expect("certificate command status");
        assert!(status.success(), "{command:?}");
    }

    async fn generate(directory: &Path) {
        let generator = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../scripts/fake-riot-client/gen-certs.ts");
        run(Command::new("bun").arg(generator).arg(directory)).await;
    }

    async fn signed_leaf(
        directory: &Path,
        serial: &str,
        subject: &str,
        extensions: &str,
    ) -> CertificateDer<'static> {
        fs::write(directory.join("probe.ext"), extensions).expect("write test extensions");
        run(Command::new("openssl").current_dir(directory).args([
            "req",
            "-new",
            "-key",
            "server-key.pem",
            "-subj",
            subject,
            "-out",
            "probe.csr",
        ]))
        .await;
        run(Command::new("openssl").current_dir(directory).args([
            "x509",
            "-req",
            "-in",
            "probe.csr",
            "-CA",
            "ca.pem",
            "-CAkey",
            "ca-key.pem",
            "-set_serial",
            serial,
            "-out",
            "probe.pem",
            "-days",
            "30",
            "-sha256",
            "-extfile",
            "probe.ext",
        ]))
        .await;
        CertificateDer::from_pem_file(directory.join("probe.pem")).expect("signed probe PEM")
    }

    #[tokio::test]
    async fn pinned_name_policy_only_falls_back_for_the_legacy_loopback_identity() {
        const SERVER_AUTH: &str =
            "extendedKeyUsage=serverAuth\nbasicConstraints=critical,CA:FALSE\n";
        const OTHER_SAN: &str = "extendedKeyUsage=serverAuth\nbasicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:localhost,IP:127.0.0.2\n";
        let directory = tempfile::tempdir().expect("temporary certificate directory");
        let trusted = directory.path().join("trusted");
        let foreign = directory.path().join("foreign");
        tokio::join!(generate(&trusted), generate(&foreign));
        let ca = CertificateDer::from_pem_file(trusted.join("ca.pem")).expect("CA PEM");
        let legacy =
            CertificateDer::from_pem_file(trusted.join("server.pem")).expect("legacy leaf");
        let foreign =
            CertificateDer::from_pem_file(foreign.join("server.pem")).expect("foreign leaf");
        let other_names = signed_leaf(&trusted, "1", "/CN=localhost", OTHER_SAN).await;
        let right_cn_wrong_san = signed_leaf(&trusted, "2", "/CN=127.0.0.1", OTHER_SAN).await;
        let wrong_cn_no_san = signed_leaf(&trusted, "3", "/CN=localhost", SERVER_AUTH).await;
        let client_only = signed_leaf(
            &trusted,
            "4",
            "/CN=127.0.0.1",
            "extendedKeyUsage=clientAuth\nbasicConstraints=critical,CA:FALSE\n",
        )
        .await;
        run(Command::new("openssl").current_dir(&trusted).args([
            "req",
            "-x509",
            "-new",
            "-key",
            "server-key.pem",
            "-subj",
            "/CN=127.0.0.1",
            "-addext",
            "basicConstraints=critical,CA:FALSE",
            "-addext",
            "extendedKeyUsage=serverAuth",
            "-out",
            "self.pem",
            "-days",
            "30",
            "-sha256",
        ]))
        .await;
        let self_signed =
            CertificateDer::from_pem_file(trusted.join("self.pem")).expect("self-signed leaf");
        let mut roots = RootCertStore::empty();
        roots.add(ca).expect("trust only generated CA");
        let verifier =
            LoopbackVerifier::new(roots, Arc::new(rustls::crypto::ring::default_provider()))
                .expect("pinned standard verifier");
        let now = UnixTime::now();
        let expired = UnixTime::since_unix_epoch(Duration::from_secs(now.as_secs() + 31 * 86_400));
        let before_validity = UnixTime::since_unix_epoch(Duration::ZERO);
        let cases = [
            ("legacy CN", &legacy, "127.0.0.1", now, true),
            ("legacy CN at DNS name", &legacy, "localhost", now, false),
            (
                "G: unrelated SANs on loopback",
                &other_names,
                "127.0.0.1",
                now,
                false,
            ),
            ("I: matching DNS SAN", &other_names, "localhost", now, true),
            ("matching IP SAN", &other_names, "127.0.0.2", now, true),
            (
                "unrelated SAN despite matching CN",
                &right_cn_wrong_san,
                "127.0.0.1",
                now,
                false,
            ),
            (
                "wrong CN without SAN",
                &wrong_cn_no_san,
                "127.0.0.1",
                now,
                false,
            ),
            ("foreign CA", &foreign, "127.0.0.1", now, false),
            ("expired", &legacy, "127.0.0.1", expired, false),
            (
                "not yet valid",
                &legacy,
                "127.0.0.1",
                before_validity,
                false,
            ),
            ("self-signed", &self_signed, "127.0.0.1", now, false),
            (
                "client-auth-only EKU",
                &client_only,
                "127.0.0.1",
                now,
                false,
            ),
        ];
        let mut failures = Vec::new();
        for (case, leaf, host, time, expected) in cases {
            let name = ServerName::try_from(host).expect("valid server name");
            let result = verifier.verify_server_cert(leaf, &[], &name, &[], time);
            if result.is_ok() != expected {
                failures.push(format!(
                    "{case}: expected accepted={expected}, got {result:?}"
                ));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }
}
