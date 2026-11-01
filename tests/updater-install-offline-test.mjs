import { chromium, webkit } from 'playwright';
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
  releaseBranch: 'release-v224-20261101',
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
const browserType = process.env.PW_BROWSER === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  const channelBytes = Buffer.from(JSON.stringify({
    app: 'The Handyman Accountancy',
    channel: 'test',
    sourceBranch: 'release-v224-20261101',
    sourceCommit: '1da46e18aae423f7488d6130a5e44542a2f4681d',
    version: '225',
    buildId: 'THA-225-INSTALL-OFFLINE-TEST',
    manifestSha256: hash(Buffer.from(JSON.stringify(nextManifest)))
  }));
  await page.route('https://raw.githubusercontent.com/Thehandymanjob/accountancy/**', async route => {
    const u = new URL(route.request().url());
    const parts = u.pathname.split('/');
    const branchName = parts[3];
    const name = parts.slice(4).join('/');
    if (branchName === 'update-channel-test' && name === 'update-channel.json') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: channelBytes });
    }
    if (branchName !== 'release-v224-20261101') return route.fulfill({ status: 404, body: 'Unknown test commit' });
    if (name === 'version.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nextManifest) });
    if (name === 'index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: newIndex });
    if (files[name]) return route.fulfill({ status: 200, contentType: name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream', body: files[name] });
    return route.fulfill({ status: 404, body: 'Unknown release asset' });
  });
  page.on('console', msg => { if (msg.type() === 'error') console.error('Browser console:', msg.text()); });
  const liveProbe = await context.newPage();
  await liveProbe.goto('http://127.0.0.1:4175/', { waitUntil: 'domcontentloaded' });
  const liveChannel = await liveProbe.evaluate(async () => {
    const channelUrl = 'https://raw.githubusercontent.com/Thehandymanjob/accountancy/update-channel-test/update-channel.json';
    const response = await fetch(channelUrl + '?_=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('Live update channel fetch failed: HTTP ' + response.status);
    const channel = await response.json();
    if (!/^[a-f0-9]{40}$/i.test(channel.sourceCommit || '')) throw new Error('Channel does not contain an immutable release commit.');
    const apiRoot = 'https://api.github.com/repos/Thehandymanjob/accountancy/contents/';
    const getFile = async name => {
      const r = await fetch(apiRoot + encodeURIComponent(name).replaceAll('%2F', '/') + '?ref=' + channel.sourceCommit, {
        cache: 'no-store', headers: { 'Accept': 'application/vnd.github+json' }
      });
      if (!r.ok) throw new Error('GitHub release asset API failed for ' + name + ': HTTP ' + r.status);
      const item = await r.json();
      if (item.type !== 'file' || !item.content) throw new Error('GitHub did not return file content for ' + name);
      const binary = atob(item.content.replace(/\\s/g, ''));
      return Uint8Array.from(binary, ch => ch.charCodeAt(0));
    };
    const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
    const manifestBytes = await getFile('version.json');
    if (await digest(manifestBytes) !== channel.manifestSha256) throw new Error('Live release manifest hash mismatch.');
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
    if (manifest.releaseBranch !== channel.sourceBranch || String(manifest.version) !== String(channel.version) || manifest.buildId !== channel.buildId) throw new Error('Live channel and release identity do not match.');
    for (const [name, spec] of Object.entries(manifest.files)) {
      if (await digest(await getFile(name)) !== spec.sha256) throw new Error('Live release asset hash mismatch: ' + name);
    }
    return { branch: channel.sourceBranch, version: channel.version, assets: Object.keys(manifest.files).length };
  });
  if (liveChannel.version !== '224' || liveChannel.assets !== 4) throw new Error('Live update channel probe returned an unexpected release.');
  await liveProbe.close();
  await page.goto('http://127.0.0.1:4175/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator) || !('caches' in window)) return false;
    await navigator.serviceWorker.ready;
    const c = await caches.open('tha-active-pointer-v1');
    return !!(await c.match(new URL('__tha_active_cache__', location.href).toString()));
  }, null, { timeout: 15000 });

  const expectedRecords = {
    entries: [{ id: 'keep-entry-001', amount: 777 }],
    customers: [{ id: 'keep-customer-001', name: 'Preserved Customer' }],
    invoices: [],
    settings: { businessName: 'Preserved Business' }
  };
  const preservesRecords = raw => {
    try {
      const data = JSON.parse(raw || 'null');
      return data?.entries?.some(x => x.id === 'keep-entry-001' && Number(x.amount) === 777)
        && data?.customers?.some(x => x.id === 'keep-customer-001' && x.name === 'Preserved Customer')
        && data?.settings?.businessName === 'Preserved Business';
    } catch { return false; }
  };
  await page.evaluate(value => localStorage.setItem('tha_v206_accounting_v1', JSON.stringify(value)), expectedRecords);
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
  if (!preservesRecords(installed.saved)) throw new Error('Saved accounting records were not preserved during installation.');

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('meta[name="app-version"]')?.content === '225', null, { timeout: 10000 });
  const offline = await page.evaluate(() => ({
    version: document.querySelector('meta[name="app-version"]')?.content,
    saved: localStorage.getItem('tha_v206_accounting_v1'),
    title: document.title
  }));
  if (offline.version !== '225' || !preservesRecords(offline.saved)) throw new Error('Offline reload failed or saved records were not preserved.');
  console.log('Updater browser test passed: v225 was staged and hash-verified, installed only after confirmation, returned to Software Update, preserved accounting data, and reopened offline from the active cache.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
