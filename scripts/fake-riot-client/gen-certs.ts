import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { $, write } from "bun";

const certDir = resolve(process.argv[2] ?? `${import.meta.dir}/certs`);
await mkdir(certDir, { recursive: true });

const subject = "/CN=YLC synthetic test CA";
await $`openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 30 -subj ${subject} -keyout ca-key.pem -out ca.pem -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign,cRLSign`
  .cwd(certDir)
  .quiet();
await $`openssl req -new -newkey rsa:2048 -nodes -subj /CN=127.0.0.1 -keyout server-key.pem -out server.csr`
  .cwd(certDir)
  .quiet();
await write(
  `${certDir}/server.ext`,
  "subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\nbasicConstraints=critical,CA:FALSE\n"
);
await $`openssl x509 -req -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out server.pem -days 30 -sha256 -extfile server.ext`
  .cwd(certDir)
  .quiet();
