'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const { build, load } = require('./build');
const { fixtures, verifyRouting, verifyICloudContentDnsPolicy, CASES } = require('./runtime-routing');
const { verifySniffing } = require('./native-sniffing');
async function freePort() {
  const s = net.createServer();
  s.listen(0, '127.0.0.1');
  await once(s, 'listening');
  const port = s.address().port;
  await new Promise((resolve) => s.close(resolve));
  return port;
}
async function run() {
  const binary = process.argv[2];
  const rulesDir = process.argv[3];
  if (!binary) throw new Error('用法：node tools/native-check.js /path/to/mihomo [/path/to/downloaded-rules]');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'myclash-native-'));
  console.log(`Evidence directory: ${temp}`);
  const cases = [{ name: 'default', settings: {} }];
  const node = {
    name: '日本 自建 住宅',
    type: 'ss',
    server: '192.0.2.1',
    port: 443,
    cipher: 'aes-128-gcm',
    password: 'test',
  };
  for (const [key, value] of Object.entries(load().ruleOptionsEnable))
    cases.push({
      name: key,
      settings: { options: { [key]: !value }, ...(key === '链式代理' ? { customProxies: [node] } : {}) },
    });
  cases.push({ name: 'both-rate-filters', settings: { options: { 过滤高倍率节点: true, 过滤低倍率节点: true } } });
  cases.push({ name: 'expanded-subscription', settings: {}, subscription: { proxies: [node] } });
  cases.push({
    name: 'expanded-chain',
    settings: { options: { 链式代理: true }, customProxies: [{ ...node, name: '美国 自建' }] },
    subscription: { proxies: [node] },
  });
  for (const entry of cases) {
    const { config } = build({ settings: entry.settings, subscription: entry.subscription });
    const file = path.join(temp, 'config.yaml');
    fs.writeFileSync(file, YAML.stringify(config));
    const result = spawnSync(binary, ['-t', '-d', temp, '-f', file], { encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, 0, `${entry.name}: ${result.stdout}\n${result.stderr}`);
  }
  console.log(`Mihomo syntax checks: ${cases.length} cases passed`);
  if (!rulesDir) return;
  const config = build().config;
  for (const [name, spec] of Object.entries(config['rule-providers'])) {
    if (spec.type === 'inline') continue;
    const file = path.resolve(rulesDir, `${name}${path.extname(spec.path)}`);
    assert.ok(fs.existsSync(file) && fs.statSync(file).size > 16, `missing rule ${name}`);
  }
  const local = await fixtures();
  // Offline, isolated smoke test: no TUN, no system routing changes, no external requests.
  const port = await freePort();
  const proxyPort = await freePort();
  config.tun.enable = false;
  // Keep the production policy keys/matchers, but replace upstreams with in-process responses.
  // NXDOMAIN identifies the international content policy; no DNS query leaves this isolated test.
  config.dns.enable = true;
  config.dns.listen = '';
  config.dns['use-hosts'] = false;
  for (const key of ['nameserver', 'direct-nameserver', 'proxy-server-nameserver'])
    config.dns[key] = ['rcode://success'];
  for (const key of Object.keys(config.dns['nameserver-policy']))
    config.dns['nameserver-policy'][key] = [key === '+.icloud-content.com' ? 'rcode://name_error' : 'rcode://success'];
  config.ntp.enable = false;
  config['mixed-port'] = proxyPort;
  config['external-controller'] = `127.0.0.1:${port}`;
  for (const [host] of CASES) config.hosts[host] = '127.0.0.1';
  delete config['external-ui'];
  delete config['external-ui-url'];
  config.profile = { 'store-selected': false, 'store-fake-ip': false };
  const nodes = ['香港 1x', '日本 1x', '美国 1x', '新加坡 1x', '台湾 1x', '日本 0.5x 家宽', '美国 3x', '德国 家宽'].map(
    (name) => ({ name, type: 'socks5', server: '127.0.0.1', port: local.socksPort }),
  );
  const provider = path.join(temp, 'subscription.yaml');
  fs.writeFileSync(provider, YAML.stringify({ proxies: nodes }));
  config['proxy-providers'] = { 订阅: { type: 'file', path: provider, 'health-check': { enable: false } } };
  for (const [name, spec] of Object.entries(config['rule-providers'])) {
    if (spec.type === 'inline') continue;
    const filename = `${name}${path.extname(spec.path)}`;
    const file = path.resolve(rulesDir, filename);
    assert.ok(fs.existsSync(file) && fs.statSync(file).size > 16, `missing rule ${name}`);
    const localFile = path.join(temp, filename);
    fs.copyFileSync(file, localFile);
    config['rule-providers'][name] = { type: 'file', path: localFile, format: spec.format, behavior: spec.behavior };
  }
  fs.writeFileSync(path.join(temp, 'runtime.yaml'), YAML.stringify(config));
  const child = spawn(binary, ['-d', temp, '-f', path.join(temp, 'runtime.yaml')], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (x) => {
    logs += x;
  });
  child.stderr.on('data', (x) => {
    logs += x;
  });
  const api = async (route) =>
    (await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(2000) })).json();
  try {
    let providers;
    for (let i = 0; i < 50; i++) {
      if (child.exitCode !== null) throw new Error(`Mihomo exited: ${logs}`);
      try {
        providers = (await api('/providers/rules')).providers;
        if (providers && Object.values(providers).every((p) => p.ruleCount > 0)) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(providers, logs);
    for (const [name, p] of Object.entries(providers)) assert.ok(p.ruleCount > 0, `${name} failed to load: ${logs}`);
    const proxies = (await api('/proxies')).proxies;
    for (const name of ['香港', '日本', '美国', '新加坡', '台湾', '低倍率节点', '高倍率节点', '家宽节点'])
      assert.ok(proxies[name].all.length > 0, `${name} empty`);
    assert.ok(proxies['日本'].all.includes('日本 1x'));
    assert.ok(!proxies['日本'].all.includes('美国 1x'));
    assert.equal(proxies.AppleNews.now, '美国');
    assert.equal(proxies.Apple智能.now, '美国');
    assert.equal(proxies.Apple.now, '直连');
    assert.equal(proxies.Microsoft.now, '直连');
    const routes = await verifyRouting({ port: proxyPort, sinkPort: local.sinkPort, track: local.track, api });
    const selected = await fetch(`http://127.0.0.1:${port}/proxies/Apple`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '美国' }),
    });
    assert.equal(selected.status, 204, 'cannot select Apple proxy for trial');
    const appleTrial = await verifyRouting({
      port: proxyPort,
      sinkPort: local.sinkPort,
      track: local.track,
      api,
      cases: [
        ['bag.itunes.apple.com', '美国', 'apple'],
        ['fpinit.itunes.apple.com', '美国', 'apple'],
        ['gspe35-ssl.ls.apple.com', '美国', 'apple'],
        ['smp-device-content.apple.com', '美国', 'apple'],
        ['gs-loc-cn.apple.com', '直连', 'apple_cn', 'Apple'],
      ],
    });
    const dnsPolicies = await verifyICloudContentDnsPolicy(api);
    fs.writeFileSync(path.join(temp, 'routes.json'), JSON.stringify(routes, null, 2));
    fs.writeFileSync(path.join(temp, 'apple-trial.json'), JSON.stringify(appleTrial, null, 2));
    fs.writeFileSync(path.join(temp, 'dns-policies.json'), JSON.stringify(dnsPolicies, null, 2));
    fs.writeFileSync(path.join(temp, 'providers.json'), JSON.stringify(providers, null, 2));
    console.log(
      `Offline runtime: ${Object.keys(providers).length} rule providers loaded; region/rate/home filters and Apple defaults verified`,
    );
    console.log(`Loopback routing: ${routes.length} actual CONNECT decisions verified`);
    console.log(`Apple proxy trial: ${appleTrial.length} actual CONNECT decisions verified`);
    console.log(`Offline DNS: ${dnsPolicies.length} actual A/AAAA policy decisions verified`);
    console.log(`Evidence directory: ${temp}`);
  } finally {
    fs.writeFileSync(path.join(temp, 'runtime.log'), logs);
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
    }
    await local.close();
  }
  const sniffing = await verifySniffing({ binary, rulesDir, temp });
  fs.writeFileSync(path.join(temp, 'sniffing.json'), JSON.stringify(sniffing, null, 2));
  console.log(`Offline sniffing: ${sniffing.length} pure-IP HTTP/TLS routing decisions verified`);
}
run().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
