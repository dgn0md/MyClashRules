'use strict';
// Optional direct DoH transport check from this host; does not prove another ISP's reachability.
const https = require('node:https');
const assert = require('node:assert/strict');
const { build } = require('./build');
const packet = Buffer.from('374201000001000000000000076578616d706c6503636f6d0000010001', 'hex');
async function query(endpoint) {
  const url = new URL(endpoint.split('#')[0]);
  url.searchParams.set('dns', packet.toString('base64url'));
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { accept: 'application/dns-message' }, timeout: 10000 }, (res) => {
      const chunks = [];
      res.on('data', (x) => chunks.push(x));
      res.on('error', reject);
      res.on('end', () => {
        try {
          assert.equal(res.statusCode, 200);
          assert.match(res.headers['content-type'], /^application\/dns-message/);
          assert.equal(req.socket.authorized, true, 'TLS certificate validation failed');
          const response = Buffer.concat(chunks);
          assert.ok(response.length >= 12 && response[0] === packet[0] && response[1] === packet[1]);
          assert.ok(response[2] & 0x80, 'not a DNS response');
          assert.equal(response[3] & 15, 0, 'DNS error');
          assert.ok(response.readUInt16BE(6) > 0, 'no DNS answer');
          resolve({ endpoint, transport: 'HTTPS', certificate: 'verified', answers: response.readUInt16BE(6) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`${endpoint}: timed out; no plaintext fallback attempted`)));
    req.on('error', reject);
  });
}
async function run() {
  const endpoints = build().config.dns['default-nameserver'];
  const results = await Promise.allSettled(endpoints.map(query));
  results.forEach((r, i) =>
    console.log(
      JSON.stringify(r.status === 'fulfilled' ? r.value : { endpoint: endpoints[i], error: r.reason.message }),
    ),
  );
  if (results.some((r) => r.status !== 'fulfilled')) process.exitCode = 1;
}
run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
