import forge from 'node-forge';
import { networkInterfaces } from 'node:os';

// @vitejs/plugin-basic-ssl (and similar tools) only add extra hosts as DNS-type SAN
// entries. Browsers require a proper IP-type SAN to validate a cert presented for an IP
// address (e.g. https://192.168.1.123:5173 when testing on a phone over LAN) — a DNS name
// that merely looks like an IP does not satisfy that check, and mobile browsers tend to
// hard-reject the connection instead of offering a click-through warning. This generates
// a fresh self-signed cert with real IP SANs for every non-internal IPv4 address on the
// machine, so it keeps working if the LAN IP changes (DHCP) without manual regeneration.
export function generateDevHttpsCertificate() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [{ name: 'commonName', value: 'jalat-location-app.local' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  const lanIps = Object.values(networkInterfaces())
    .flat()
    .filter((info) => info && info.family === 'IPv4' && !info.internal)
    .map((info) => info.address);

  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' }, // DNS
        { type: 7, ip: '127.0.0.1' },
        { type: 7, ip: '::1' },
        ...lanIps.map((ip) => ({ type: 7, ip })),
      ],
    },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert),
  };
}
