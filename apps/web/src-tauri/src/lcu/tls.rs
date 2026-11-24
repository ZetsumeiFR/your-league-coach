use std::net::Ipv4Addr;

use rustls::{
    CertificateError, DigitallySignedStruct, Error, RootCertStore, SignatureScheme,
    client::{
        danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
        verify_server_cert_signed_by_trust_anchor, verify_server_name,
    },
    crypto::{WebPkiSupportedAlgorithms, verify_tls12_signature, verify_tls13_signature},
    pki_types::{CertificateDer, ServerName, UnixTime},
    server::ParsedCertificate,
};

#[derive(Debug)]
pub(super) struct LoopbackVerifier {
    roots: RootCertStore,
    algorithms: WebPkiSupportedAlgorithms,
}

impl LoopbackVerifier {
    pub(super) const fn new(roots: RootCertStore, algorithms: WebPkiSupportedAlgorithms) -> Self {
        Self { roots, algorithms }
    }
}

impl ServerCertVerifier for LoopbackVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        now: UnixTime,
    ) -> Result<ServerCertVerified, Error> {
        if *server_name != ServerName::IpAddress(Ipv4Addr::LOCALHOST.into()) {
            return Err(Error::General("Riot TLS requires 127.0.0.1".into()));
        }

        let cert = ParsedCertificate::try_from(end_entity)?;
        verify_server_cert_signed_by_trust_anchor(
            &cert,
            &self.roots,
            intermediates,
            now,
            self.algorithms.all,
        )?;

        // An LCU leaf can identify loopback only by CN. Ignore only the SAN
        // mismatch, after webpki has verified the pinned server-auth chain.
        match verify_server_name(&cert, server_name) {
            Ok(())
            | Err(Error::InvalidCertificate(
                CertificateError::NotValidForName | CertificateError::NotValidForNameContext { .. },
            )) => Ok(ServerCertVerified::assertion()),
            Err(error) => Err(error),
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        verify_tls12_signature(message, cert, signature, &self.algorithms)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        verify_tls13_signature(message, cert, signature, &self.algorithms)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.algorithms.supported_schemes()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustls::pki_types::pem::PemObject;
    use std::{path::Path, time::Duration};

    #[tokio::test]
    async fn valid_pinned_chain_is_only_accepted_for_exact_ipv4_loopback() {
        let directory = tempfile::tempdir().expect("temporary certificate directory");
        let generator = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../scripts/fake-riot-client/gen-certs.ts");
        let mut child = tokio::process::Command::new("bun")
            .arg(generator)
            .arg(directory.path())
            .kill_on_drop(true)
            .spawn()
            .expect("launch certificate generator");
        let status = tokio::time::timeout(Duration::from_secs(15), child.wait())
            .await
            .expect("certificate generator deadline")
            .expect("generator status");
        assert!(status.success());
        let ca = CertificateDer::from_pem_file(directory.path().join("ca.pem")).expect("CA PEM");
        let leaf =
            CertificateDer::from_pem_file(directory.path().join("server.pem")).expect("leaf PEM");
        let mut roots = RootCertStore::empty();
        roots.add(ca).expect("trust only generated CA");
        let verifier = LoopbackVerifier::new(
            roots,
            rustls::crypto::ring::default_provider().signature_verification_algorithms,
        );
        let now = UnixTime::now();
        let loopback = ServerName::try_from("127.0.0.1").expect("IPv4 loopback");
        let parsed = ParsedCertificate::try_from(&leaf).expect("valid DER");
        assert!(matches!(
            verify_server_name(&parsed, &loopback),
            Err(Error::InvalidCertificate(
                CertificateError::NotValidForName | CertificateError::NotValidForNameContext { .. }
            ))
        ));
        assert!(
            verifier
                .verify_server_cert(&leaf, &[], &loopback, &[], now)
                .is_ok()
        );
        for host in ["localhost", "127.0.0.2", "::1", "192.0.2.1"] {
            let name = ServerName::try_from(host).expect("valid server name");
            assert!(
                verifier
                    .verify_server_cert(&leaf, &[], &name, &[], now)
                    .is_err(),
                "{host}"
            );
        }
        let before_validity = UnixTime::since_unix_epoch(Duration::ZERO);
        assert!(matches!(
            verifier.verify_server_cert(&leaf, &[], &loopback, &[], before_validity),
            Err(Error::InvalidCertificate(
                CertificateError::NotValidYet | CertificateError::NotValidYetContext { .. }
            ))
        ));
    }
}
