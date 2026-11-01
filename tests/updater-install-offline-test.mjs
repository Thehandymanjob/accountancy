import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const files = {
  'index.html': await readFile(resolve('index.html')),
  'version-manager.js': await readFile(resolve('version-manager.js')),
  'service-worker.js': await readFile(resolve('service-worker.js')),
  'storage-foundation.js': await readFile(resolve('storage-foundation.js'))
};
const oldManifest = JSON.parse(await readFile(resolve('version.json'), 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');
const newIndex = Buffer.from(files['index.html'].toString('utf8')
  .replace('app-version" content="224"', 'app-version" content="225"')
  .replace('app-build-id" content="THA-224-MANUAL-CACHED-UPDATER-20261101"', 'app-build-id" content="THA-225-INSTALL-OFFLINE-TEST"'));
const makeManifest = (version, buildId, indexBytes) => ({
  app: 'The Handyman Accountancy',
  version: String(version),
  buildId,
  releaseDate: '2026-11-01',
  releaseStatus: 'automated-test-only',
  databaseSchema: 1,
  minimumAppVersion: '206',
  storageNamespace: 'tha_v206_',
  legacyDataImport: 'manual-only',
  files: {
    'index.html': { sha256: hash(indexBytes) },
    'version-manager.js': { sha256: hash(files['version-manager.js']) },
    'service-worker.js': { sha256: hash(files['service-worker.js']) },
    'storage-foundation.js': { sha256: hash(files['storage-foundation.js']) }
  },
  releaseNotes: ['Automated test build only.']
});
const currentManifest = makeManifest('224', oldManifest.buildId, files['index.html']);
const nextManifest = makeManifest('225', 'THA-225-INSTALL-OFFLINE-TEST', newIndex);
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const name = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
  const isStage = u.searchParams.has('_stage');
  const isCheck = u.searchParams.has('_check');
  let body;
  if (name === 'version.json') {
    body = Buffer.from(JSON.stringify(isStage || isCheck ? nextManifest : currentManifest));
  } else if (name === 'index.html' && isStage) {
    body = newIndex;
  } else if (files[name]) {
    body = files[name];
  } else {
    res.writeHead(404); res.end('Not found'); return;
  }
  const type = name.endsWith('.json') ? 'application/json'
    : name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
});
await new Promise(resolve => server.listen(4175, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') console.error('Browser console:', msg.text()); });
  await page.goto('http://127.0.0.1:4175/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator) || !('caches' in window)) return false;
    await navigator.serviceWorker.ready;
    const c = await caches.open('tha-active-pointer-v1');
    return !!(await c.match(new URL('__tha_active_cache__', location.href).toString()));
  }, null, { timeout: 15000 });

  const saved = JSON.stringify({
    entries: [{ id: 'keep-entry-001', amount: 777 }],
    customers: [{ id: 'keep-customer-001', name: 'Preserved Customer' }],
    invoices: [],
    settings: { businessName: 'Preserved Business' }
  });
  await page.evaluate(value => localStorage.setItem('tha_v206_accounting_v1', value), saved);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { openAccountancy(); show('softwareUpdate'); });

  await page.evaluate(() => window.checkForAppUpdate(true));
  await page.waitForFunction(() => {
    const b = document.getElementById('appReloadUpdate');
    return b && !b.disabled && b.textContent.includes('Update Now');
  }, null, { timeout: 20000 });
  const beforeInstall = await page.locator('#appUpdateStatus').textContent();
  if (!beforeInstall.includes('downloaded and verified')) throw new Error('Update package was not verified before installation.');
  await page.locator('#appReloadUpdate').click();
  await page.waitForFunction(() => document.querySelector('meta[name="app-version"]')?.content === '225', null, { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('appUpdateStatus')?.textContent.includes('Update successful'), null, { timeout: 10000 });
  const installed = await page.evaluate(() => ({
    version: document.querySelector('meta[name="app-version"]')?.content,
    build: document.querySelector('meta[name="app-build-id"]')?.content,
    pageVisible: document.getElementById('softwareUpdate')?.classList.contains('active') && document.body.classList.contains('accountancy-open'),
    saved: localStorage.getItem('tha_v206_accounting_v1')
  }));
  if (installed.version !== '225' || installed.build !== 'THA-225-INSTALL-OFFLINE-TEST') throw new Error('Installed build identity does not match the staged build.');
  if (!installed.pageVisible) throw new Error('After installation the app did not return to a visible Software Update page.');
  if (installed.saved !== saved) throw new Error('Saved accounting records changed during installation.');

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('meta[name="app-version"]')?.content === '225', null, { timeout: 10000 });
  const offline = await page.evaluate(() => ({
    version: document.querySelector('meta[name="app-version"]')?.content,
    saved: localStorage.getItem('tha_v206_accounting_v1'),
    title: document.title
  }));
  if (offline.version !== '225' || offline.saved !== saved) throw new Error('Offline reload failed or saved records changed.');
  console.log('Updater browser test passed: v225 was staged and hash-verified, installed only after confirmation, returned to Software Update, preserved accounting data, and reopened offline from the active cache.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
