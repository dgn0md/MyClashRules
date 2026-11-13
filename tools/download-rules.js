'use strict';
// Downloads only public rule artifacts referenced by the generated config; never reads subscriptions.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { build } = require('./build');
async function run() {
  const dir = path.resolve(process.argv[2] || '.local/rules');
  fs.mkdirSync(dir, { recursive: true });
  const entries = Object.entries(build().config['rule-providers']).filter(([, spec]) => spec.type !== 'inline');
  const manifest = [];
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const [name, spec] = entries[cursor++];
      const response = await fetch(spec.url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      // MRS is Zstandard-compressed; semantic validation is done by native-check.js with Mihomo.
      if (bytes.length < 16 || bytes.subarray(0, 4).toString('hex') !== '28b52ffd')
        throw new Error(`${name}: invalid compressed MRS header`);
      fs.writeFileSync(path.join(dir, `${name}.mrs`), bytes);
      manifest.push({
        name,
        url: spec.url,
        behavior: spec.behavior,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  manifest.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ checkedAt: new Date().toISOString(), providers: manifest }, null, 2) + '\n',
  );
  console.log(`Verified ${manifest.length} public MRS downloads in ${dir}`);
}
run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
