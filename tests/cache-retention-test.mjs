import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../version-manager.js', import.meta.url), 'utf8');
const match = source.match(/async function cleanupOldAppCaches\(activeCache,previousCache\)\s*\{[\s\S]*?\n\}/);
assert.ok(match, 'cleanupOldAppCaches must exist');
const deleted = [];
const names = [
  'tha-app-v224-old',
  'tha-app-v225-previous',
  'tha-app-v226-current',
  'tha-active-pointer-v1',
  'unrelated-cache',
  'tha-app-v223-bootstrap'
];
const context = {
  caches: {
    async keys() { return [...names]; },
    async delete(name) { deleted.push(name); return true; }
  }
};
const cleanup = vm.runInNewContext('(' + match[0].replace('async function cleanupOldAppCaches', 'async function') + ')', context);
const result = await cleanup('tha-app-v226-current', 'tha-app-v225-previous');
assert.deepEqual([...result.kept].sort(), ['tha-app-v225-previous', 'tha-app-v226-current'].sort());
assert.deepEqual([...deleted].sort(), ['tha-app-v223-bootstrap', 'tha-app-v224-old'].sort());
assert.ok(!deleted.includes('tha-active-pointer-v1'));
assert.ok(!deleted.includes('unrelated-cache'));
console.log('PASS: active and previous app caches retained; older app caches pruned; unrelated and pointer caches untouched.');
