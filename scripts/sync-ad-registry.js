const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(__dirname, '../../mobile_app/assets/ad_registry.json');
const target = path.resolve(__dirname, '../config/adRegistry.json');
const registry = JSON.parse(fs.readFileSync(source, 'utf8'));
if (!registry.pages?.length) throw Error('Empty ad registry');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(registry, null, 2) + '\n');
console.log(`Synced ${registry.pages.length} supported Flutter pages`);
