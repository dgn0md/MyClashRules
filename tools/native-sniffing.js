'use strict';
// Pure-IP requests with real HTTP Host/TLS ClientHello metadata. Every outbound ends on loopback.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const YAML = require('yaml');
const { build } = require('./build');
const { fixtures } = require('./runtime-routing');
async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function probe({ port, api, host, protocol, expected, payload, ip = '20.205.243.166' }) {
  const socket = net.connect(port, '127.0.0.1');
  socket.on('error', () => {});
  let secure;
  let timeout;
  try {
    await once(socket, 'connect');
    const destination = `${net.isIPv6(ip) ? `[${ip}]` : ip}:${protocol === 'HTTP' ? 80 : 443}`;
    socket.write(`CONNECT ${destination} HTTP/1.1\r\nHost: ${destination}\r\n\r\n`);
    const [response] = await Promise.race([
      once(socket, 'data'),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('CONNECT timeout')), 4000);
      }),
    ]);
    clearTimeout(timeout);
    assert.match(response.toString(), /200/);
    if (protocol === 'TLS') {
      // Generate a genuine ClientHello; no remote TLS handshake or certificate bypass is needed.
      secure = tls.connect({ socket, servername: host });
      secure.on('error', () => {});
    } else {
      socket.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: keep-alive\r\n\r\n`);
    }
    let connection;
    for (let i = 0; i < 50; i++) {
      connection = (await api('/connections')).connections?.find(
        (entry) => String(entry.metadata.sourcePort) === String(socket.localPort),
      );
      if (connection) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(connection, `${protocol} ${host}: missing connection`);
    assert.equal(connection.metadata.destinationIP, ip, 'sniffing must preserve the target IP');
    assert.ok(connection.chains.includes(expected), JSON.stringify(connection));
    assert.equal(connection.rulePayload, payload);
    if (expected !== 'Microsoft') assert.equal(connection.metadata.sniffHost, host);
    return { protocol, host, ip, expected, sniffHost: connection.metadata.sniffHost, payload: connection.rulePayload };
  } finally {
    clearTimeout(timeout);
    secure?.destroy();
    socket.destroy();
  }
}
async function verifySniffing({ binary, rulesDir, temp }) {
  const evidence = [];
  for (const enabled of [false, true]) {
    const local = await fixtures();
    const dir = path.join(temp, `sniff-${enabled}`);
    fs.mkdirSync(dir);
    const port = await freePort();
    const controller = await freePort();
    // Exercise the actual generated sniffer settings, including the public off switch.
    const config = build({ settings: { options: { 域名嗅探: enabled } } }).config;
    config.tun.enable = false;
    config.ntp.enable = false;
    config.dns.listen = '';
    config.dns['use-hosts'] = false;
    for (const key of ['nameserver', 'direct-nameserver', 'proxy-server-nameserver'])
      config.dns[key] = ['rcode://success'];
    for (const key of Object.keys(config.dns['nameserver-policy']))
      config.dns['nameserver-policy'][key] = ['rcode://success'];
    config['mixed-port'] = port;
    config['external-controller'] = `127.0.0.1:${controller}`;
    delete config['external-ui'];
    delete config['external-ui-url'];
    config.profile = { 'store-selected': false, 'store-fake-ip': false };
    // Replace even direct exits: a failed sniff must never dial the real destination.
    config.proxies = config.proxies
      .filter((entry) => entry.type === 'dns')
      .concat([{ name: 'loopback-sink', type: 'socks5', server: '127.0.0.1', port: local.socksPort }]);
    delete config['proxy-providers'];
    for (const group of config['proxy-groups']) {
      group.proxies = ['loopback-sink'];
      delete group.use;
      delete group['include-all-providers'];
      delete group['default-selected'];
    }
    for (const [name, spec] of Object.entries(config['rule-providers'])) {
      if (spec.type === 'inline') continue;
      const file = path.join(dir, `${name}.mrs`);
      fs.copyFileSync(path.resolve(rulesDir, `${name}.mrs`), file);
      config['rule-providers'][name] = { type: 'file', path: file, format: 'mrs', behavior: spec.behavior };
    }
    const file = path.join(dir, 'config.yaml');
    fs.writeFileSync(file, YAML.stringify(config));
    const child = spawn(binary, ['-d', dir, '-f', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = '';
    child.stdout.on('data', (data) => (logs += data));
    child.stderr.on('data', (data) => (logs += data));
    const api = async (route) =>
      (await fetch(`http://127.0.0.1:${controller}${route}`, { signal: AbortSignal.timeout(2000) })).json();
    try {
      let ready = false;
      for (let i = 0; i < 50; i++) {
        if (child.exitCode !== null) throw new Error(logs);
        try {
          const providers = (await api('/providers/rules')).providers;
          ready = providers && Object.values(providers).every((entry) => entry.ruleCount > 0);
          if (ready) break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(ready, logs);
      const cases = enabled
        ? [
            { host: 'github.com', protocol: 'TLS', expected: 'GitHub', payload: 'github' },
            { host: 'github.com', protocol: 'HTTP', expected: 'GitHub', payload: 'github' },
            { host: 'github.com', protocol: 'TLS', ip: '2001:db8::42', expected: 'GitHub', payload: 'github' },
            { host: 'api-siri-prod.apple.com', protocol: 'TLS', expected: 'Siri', payload: 'api-siri-prod.apple.com' },
            { host: 'apple-relay.apple.com', protocol: 'TLS', expected: 'Apple智能', payload: 'apple-relay.apple.com' },
            { host: 'www.microsoft.com', protocol: 'TLS', expected: 'Microsoft', payload: 'microsoft' },
          ]
        : [{ host: 'github.com', protocol: 'TLS', expected: 'Microsoft', payload: 'microsoft_ip' }];
      for (const entry of cases) evidence.push({ enabled, ...(await probe({ port, api, ...entry })) });
    } finally {
      fs.writeFileSync(path.join(dir, 'runtime.log'), logs);
      if (child.exitCode === null) {
        const end = once(child, 'exit');
        child.kill('SIGTERM');
        await end;
      }
      await local.close();
    }
  }
  return evidence;
}
module.exports = { verifySniffing };
