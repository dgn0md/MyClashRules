'use strict';
// YAML is a static Mihomo document. This compiler applies the JS options before serialization.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const YAML = require('yaml');
const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'Script/mihomoScript.js');
function load() {
  const sandbox = {};
  vm.createContext(sandbox);
  const source = fs.readFileSync(SCRIPT, 'utf8');
  vm.runInContext(
    source +
      '\nglobalThis.api = {main, ruleOptionsEnable, customizeProxies, regionDefinitions, rateRegionDefinitions, homeRegionDefinitions, excludeFilter};',
    sandbox,
    { timeout: 5000 },
  );
  return sandbox.api;
}
function readYaml(file) {
  const doc = YAML.parseDocument(fs.readFileSync(file, 'utf8'), { uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  return doc.toJS();
}
function configure(api, settings) {
  const options = settings.options || {};
  for (const [key, value] of Object.entries(options)) {
    if (!Object.prototype.hasOwnProperty.call(api.ruleOptionsEnable, key)) throw new Error(`未知配置项：${key}`);
    if (typeof value !== 'boolean') throw new Error(`${key} 必须填写 true 或 false`);
    api.ruleOptionsEnable[key] = value;
  }
  if (settings.customProxies) {
    if (!Array.isArray(settings.customProxies)) throw new Error('customProxies 必须为节点数组');
    api.customizeProxies.push(...settings.customProxies);
  }
}
function template(api, settings) {
  // Compile all possible region/rate/home groups, then replace seed members with runtime provider filters.
  // Seeds are never serialized or dialed. Expanded-subscription mode instead uses actual node names.
  const names = api.regionDefinitions
    .flatMap((r) => [`${r.name} 1x`, `${r.name} 0.5x 家宽`, `${r.name} 3x`])
    .concat(['德国 家宽']);
  const seeds = names.map((name, i) => ({
    name,
    type: 'ss',
    server: `192.0.2.${i + 1}`,
    port: 443,
    cipher: 'aes-128-gcm',
    password: 'template',
  }));
  const out = api.main({ proxies: seeds });
  const seedNames = new Set(out.proxies.filter((p) => p.password === 'template').map((p) => p.name));
  out.proxies = out.proxies.filter((p) => !seedNames.has(p.name));
  const definitions = [...api.regionDefinitions, ...api.rateRegionDefinitions, ...api.homeRegionDefinitions];
  const info = api.ruleOptionsEnable.过滤非地区节点 ? [api.excludeFilter.source] : [];
  if (api.ruleOptionsEnable.过滤低倍率节点) info.push(api.rateRegionDefinitions[0].regex.source);
  if (api.ruleOptionsEnable.过滤高倍率节点) info.push(api.rateRegionDefinitions[1].regex.source);
  for (const group of out['proxy-groups']) {
    const members = group.proxies || [];
    if (!members.some((p) => seedNames.has(p))) continue;
    group.proxies = members.filter((p) => !seedNames.has(p));
    group['include-all-providers'] = true;
    group['exclude-type'] = 'DIRECT|REJECT|REMATCH';
    const baseName = group.name.replace(/-自动选择$/, '');
    const def = definitions.find((r) => r.name === baseName);
    if (def) group.filter = `(?i)${def.regex.source}`;
    const excludes = [...info];
    if (baseName === '其他节点') excludes.push(...api.regionDefinitions.map((r) => r.regex.source));
    if (excludes.length) group['exclude-filter'] = `(?i)(?:${excludes.join('|')})`;
    if (!group.proxies.length) delete group.proxies;
  }
  const provider = settings.subscription || {};
  out['proxy-providers'] = {
    订阅: {
      type: 'http',
      url: provider.url || 'https://example.invalid/replace-with-your-subscription',
      path: './proxy_provider/subscription.yaml',
      interval: 86400,
      proxy: 'DIRECT',
      'exclude-type': 'DIRECT|REJECT|REMATCH',
      'health-check': {
        enable: true,
        url: 'https://www.apple.com/library/test/success.html',
        interval: 600,
        lazy: true,
      },
      ...(api.ruleOptionsEnable.代理IPV4优先 !== api.ruleOptionsEnable.代理IPV6优先
        ? {
            override: { 'ip-version': api.ruleOptionsEnable.代理IPV4优先 ? 'ipv4-prefer' : 'ipv6-prefer' },
          }
        : {}),
    },
  };
  // Provider mode cannot inspect private DNS/hosts in a remote subscription. Use expanded mode for such providers.
  return out;
}
function render(config, api, settings) {
  const optionsBlock = /const ruleOptionsEnable = \{([\s\S]*?)\n\};/.exec(fs.readFileSync(SCRIPT, 'utf8'))[1];
  const descriptions = {};
  for (const line of optionsBlock.split('\n')) {
    const m = /^\s*(\S+): (?:true|false),\s*\/\/ (.*)$/.exec(line);
    if (m) descriptions[m[1]] = m[2];
  }
  const header = [
    '# myClashRules 全量配置；派生自 AIsouler/MyClash（MIT），生成器：tools/build.js。',
    '# 仅适用于 Mihomo。关闭客户端 DNS 覆写。第一次使用请填 proxy-providers.订阅.url。',
    '# 此 YAML 的开关由生成器读取，Mihomo 不执行 x-myClashRules。只改 true/false 后运行：',
    '# node tools/build.js --settings Config/mihomoConfig.yaml --output .local/myConfig.yaml',
    '# 私有 DNS/hosts 机场请使用 --subscription .local/subscription.yaml，以执行完整节点处理。',
    '# 严格模式无明文上游 DNS；需 TUN/网关接管才覆盖系统流量。不可达时不降级。',
    '# 请勿将真实订阅链接/节点提交到 Git。true 是正确拼写，ture 会被拒绝。',
  ].join('\n');
  const metadata = {
    options: { ...api.ruleOptionsEnable },
    customProxies: JSON.parse(JSON.stringify(api.customizeProxies)),
  };
  const doc = new YAML.Document({ 'x-myClashRules': metadata, ...JSON.parse(JSON.stringify(config)) });
  const options = doc.getIn(['x-myClashRules', 'options'], true);
  for (const pair of options.items) pair.value.comment = ' ' + (descriptions[pair.key.value] || '');
  const comments = {
    dns: 'DNS：国内加密直连，境外加密经代理；Apple 精确 policy 优先。不要添加 system/UDP 兜底。',
    tun: 'TUN 接管 TCP/UDP 53；strict-route 在支持的平台防多网卡旁路。关闭 TUN 需上级 DNS 接管。',
    'proxy-providers': '填入 Clash/Mihomo 订阅 URL；静态 provider 模式不能读取机场的顶层 DNS/hosts。',
    proxies: '自定义节点与五种直连出口；链式落地须在 x-myClashRules.customProxies 配置并重新生成。',
    'proxy-groups': '全量服务/地区/倍率/家宽组。静态地区无节点时回退 REJECT；脚本只生成有节点的组。',
    'rule-providers': '远程 MRS 每日更新；本地 inline 规则随配置更新。国内域名库仅参与 DNS，不整体强制直连。',
    rules:
      '顺序：DNS 接管 → Apple AI/Siri/CDN 例外 → 广告/国内服务 → 服务域名 → 海外域名 → CN IP → 私网 IP → 服务 IP → 兜底。',
  };
  for (const [key, comment] of Object.entries(comments)) {
    const value = doc.get(key, true);
    if (value) value.commentBefore = ' ' + comment;
  }
  return header + '\n\n' + doc.toString({ lineWidth: 120 });
}
function build({ settings = {}, subscription } = {}) {
  const api = load();
  configure(api, settings);
  const config = subscription ? api.main(subscription) : template(api, settings);
  return { config: JSON.parse(JSON.stringify(config)), text: render(config, api, settings) };
}
function cli(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (name === '--check') flags.check = true;
    else if (
      ['--settings', '--subscription', '--output'].includes(name) &&
      args[i + 1] &&
      !args[i + 1].startsWith('--')
    )
      flags[name.slice(2)] = args[++i];
    else throw new Error(`未知或缺少值的参数：${name}`);
  }
  const input = flags.settings ? readYaml(flags.settings) : {};
  const settings = input['x-myClashRules'] || input;
  if (input['proxy-providers']?.订阅?.url) settings.subscription = { url: input['proxy-providers'].订阅.url };
  const result = build({ settings, subscription: flags.subscription ? readYaml(flags.subscription) : undefined });
  const output = path.resolve(flags.output || path.join(ROOT, 'Config/mihomoConfig.yaml'));
  if (flags.check) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== result.text)
      throw new Error('生成配置已漂移，请执行 npm run build');
    console.log('Generated YAML is up to date.');
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, result.text, { mode: 0o600 });
    console.log(`Generated ${output}`);
  }
}
module.exports = { load, build, readYaml, configure };
if (require.main === module) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
