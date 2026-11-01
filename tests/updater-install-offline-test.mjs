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
const installedVersion = String(oldManifest.version);
const previousVersion = String(Number(installedVersion) - 1);
const previousBuildId = 'THA-' + previousVersion + '-PREVIOUS-TEST';
const installedIndexText = files['index.html'].toString('utf8');
const installedBuildId = oldManifest.buildId;
const previousIndex = Buffer.from(installedIndexText
  .replace('app-version" content="' + installedVersion + '"', 'app-version" content="' + previousVersion + '"')
  .replace('app-build-id" content="' + installedBuildId + '"', 'app-build-id" content="' + previousBuildId + '"'));
const newIndex = files['index.html'];
const makeManifest = (version, buildId, indexBytes) => ({
  app: 'The Handyman Accountancy',
  version: String(version),
  buildId,
  releaseDate: '2026-11-01',
  releaseStatus: 'automated-test-only',
  releaseBranch: oldManifest.releaseBranch,
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
const currentManifest = makeManifest(previousVersion, previousBuildId, previousIndex);
const nextManifest = oldManifest;
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const name = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
  const isStage = u.searchParams.has('_stage');
  const isCheck = u.searchParams.has('_check');
  let body;
  if (name === 'version.json') {
    body = Buffer.from(JSON.stringify(isStage || isCheck ? nextManifest : currentManifest));
  } else if (name === 'index.html') {
    body = isStage ? newIndex : previousIndex;
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
  context.on('serviceworker', worker => {
    console.log('Service worker attached:', worker.url());
    worker.on('console', msg => console.log('Service worker console ['+msg.type()+']:', msg.text()));
    worker.on('pageerror', error => console.error('Service worker page error:', error));
  });
  const channelBytes = Buffer.from(JSON.stringify({
    app: 'The Handyman Accountancy',
    channel: 'test',
    sourceBranch: oldManifest.releaseBranch,
    sourceCommit: '1da46e18aae423f7488d6130a5e44542a2f4681d',
    version: installedVersion,
    buildId: installedBuildId,
    manifestSha256: hash(Buffer.from(JSON.stringify(nextManifest)))
  }));
  page.on('console', msg => { console.log('Browser console ['+msg.type()+']:', msg.text()); });
  // Mock remote update-channel/release fetches inside the page realm. WebKit may
  // route page fetches through an active Service Worker before Playwright network
  // interception sees them, so use a deterministic fetch shim for this isolated test.
  const mockFiles = Object.fromEntries(Object.entries(files).map(([name, data]) => [name, Buffer.from(data).toString('base64')]));
  await page.addInitScript(({ channelText, manifestText, previousManifestText, previousIndexBase64, nextIndexBase64, mockFiles, releaseBranch, previousCacheName }) => {
    // Model an already-installed v224 app: its verified shell and active pointer
    // must exist before the user checks for v225. The fallback cache created by
    // the Service Worker is not itself proof of a known-good previous build.
    const seedPreviousBuild = (async () => {
      // addInitScript runs again after every navigation. Seed the previous
      // installation only once; otherwise this test harness resets the active
      // cache pointer to v224 after the v225 install navigation.
      if (sessionStorage.getItem('__tha_test_previous_build_seeded') === '1') return;
      sessionStorage.setItem('__tha_test_previous_build_seeded', '1');
      const base = new URL('.', document.baseURI);
      const previous = await caches.open(previousCacheName);
      const decode = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      for (const [name, encoded] of Object.entries(mockFiles)) {
        await previous.put(new URL(name, base), new Response(decode(encoded)));
      }
      await previous.put(new URL('index.html', base), new Response(decode(previousIndexBase64), { headers: { 'content-type': 'text/html; charset=utf-8' } }));
      await previous.put(new URL('version.json', base), new Response(previousManifestText, { headers: { 'content-type': 'application/json' } }));
      const pointer = await caches.open('tha-active-pointer-v1');
      await pointer.put(new URL('__tha_active_cache__', base), new Response(JSON.stringify({ cacheName: previousCacheName })));
    })();
    const originalFetch = window.fetch.bind(window);
    const decode = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    window.fetch = async (input, init) => {
      await seedPreviousBuild;
      const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input && typeof input.url === 'string' ? input.url : '';
      if (requestUrl.startsWith('https://raw.githubusercontent.com/Thehandymanjob/accountancy/')) {
        const u = new URL(requestUrl);
        const parts = u.pathname.split('/');
        const branchName = parts[3];
        const name = parts.slice(4).join('/');
        if (branchName === 'update-channel-test' && name === 'update-channel.json') {
          return new Response(channelText, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
        }
        if (branchName !== releaseBranch) return new Response('Unknown test release', { status: 404 });
        if (name === 'version.json') return new Response(manifestText, { status: 200, headers: { 'content-type': 'application/json' } });
        if (name === 'index.html') return new Response(decode(nextIndexBase64), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
        if (mockFiles[name]) return new Response(decode(mockFiles[name]), { status: 200, headers: { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' } });
        return new Response('Unknown release asset', { status: 404 });
      }
      return originalFetch(input, init);
    };
  }, {
    channelText: channelBytes.toString('utf8'),
    manifestText: JSON.stringify(nextManifest),
    previousManifestText: JSON.stringify(currentManifest),
    previousIndexBase64: previousIndex.toString('base64'),
    nextIndexBase64: newIndex.toString('base64'),
    mockFiles,
    releaseBranch: oldManifest.releaseBranch,
    previousCacheName: 'tha-app-v' + previousVersion
  });
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
  try {
    await page.waitForFunction(() => {
      const b = document.getElementById('appReloadUpdate');
      return b && !b.disabled && b.textContent.includes('Update Now');
    }, null, { timeout: 20000 });
  } catch (error) {
    console.error('Updater diagnostic:', await page.evaluate(() => ({
      status: document.getElementById('appUpdateStatus')?.textContent,
      button: document.getElementById('appReloadUpdate')?.textContent,
      disabled: document.getElementById('appReloadUpdate')?.disabled,
      installed: document.querySelector('meta[name="app-version"]')?.content,
      serviceWorker: 'serviceWorker' in navigator,
      caches: 'caches' in window
    })));
    throw error;
  }
  const beforeInstall = await page.locator('#appUpdateStatus').textContent();
  if (!beforeInstall.includes('downloaded and verified')) throw new Error('Update package was not verified before installation.');
  await page.locator('#appReloadUpdate').click();
  try {
    await page.waitForFunction(expected => document.querySelector('meta[name="app-version"]')?.content === expected, installedVersion, { timeout: 15000 });
  } catch (error) {
    console.error('Install diagnostic:', await page.evaluate(async () => {
      const p = await caches.open('tha-active-pointer-v1');
      const a = await p.match(new URL('__tha_active_cache__', location.href));
      const r = await p.match(new URL('__tha_pending_activation__', location.href));
      return {
        url: location.href,
        version: document.querySelector('meta[name="app-version"]')?.content,
        build: document.querySelector('meta[name="app-build-id"]')?.content,
        status: document.getElementById('appUpdateStatus')?.textContent,
        controller: !!navigator.serviceWorker.controller,
        active: a ? await a.json() : null,
        pending: r ? await r.json() : null,
        cacheNames: await caches.keys()
      };
    }));
    throw error;
  }
  try {
    await page.waitForFunction(() => document.getElementById('appUpdateStatus')?.textContent.includes('Update successful'), null, { timeout: 10000 });
  } catch (error) {
    console.error('Post-install confirmation diagnostic:', await page.evaluate(() => ({
      url: location.href,
      version: document.querySelector('meta[name="app-version"]')?.content,
      build: document.querySelector('meta[name="app-build-id"]')?.content,
      status: document.getElementById('appUpdateStatus')?.textContent,
      softwareUpdateExists: !!document.getElementById('softwareUpdate'),
      softwareUpdateActive: document.getElementById('softwareUpdate')?.classList.contains('active'),
      accountancyOpen: document.body.classList.contains('accountancy-open'),
      openAccountancyType: typeof window.openAccountancy,
      showType: typeof window.show
    })));
    throw error;
  }
  const installed = await page.evaluate(() => ({
    version: document.querySelector('meta[name="app-version"]')?.content,
    build: document.querySelector('meta[name="app-build-id"]')?.content,
    pageVisible: document.getElementById('softwareUpdate')?.classList.contains('active') && document.body.classList.contains('accountancy-open'),
    saved: localStorage.getItem('tha_v206_accounting_v1')
  }));
  if (installed.version !== installedVersion || installed.build !== installedBuildId) throw new Error('Installed build identity does not match the staged build.');
  if (!installed.pageVisible) throw new Error('After installation the app did not return to a visible Software Update page.');
  if (!preservesRecords(installed.saved)) throw new Error('Saved accounting records were not preserved during installation.');

  // Wait for the new build's own startup confirmation, not merely for a
  // transiently absent rollback marker (which can race with cache activation).
  try {
    await page.waitForFunction(() => window.__thaPendingActivationDiagnostics?.result === 'confirmed', null, { timeout: 7000 });
  } catch (error) {
    console.error('Startup confirmation diagnostic:', await page.evaluate(async () => {
      const pointer = await caches.open('tha-active-pointer-v1');
      const active = await pointer.match(new URL('__tha_active_cache__', location.href));
      const pending = await pointer.match(new URL('__tha_pending_activation__', location.href));
      return {
        startupDiagnostics: window.__thaPendingActivationDiagnostics || null,
        active: active ? await active.json() : null,
        pending: pending ? await pending.json() : null,
        cacheNames: await caches.keys(),
        status: document.getElementById('appUpdateStatus')?.textContent
      };
    }));
    throw error;
  }
  const confirmedActive = await page.evaluate(async () => {
    const pointer = await caches.open('tha-active-pointer-v1');
    const active = await pointer.match(new URL('__tha_active_cache__', location.href));
    return active ? await active.json() : null;
  });
  if (confirmedActive?.cacheName !== 'tha-app-v' + installedVersion + '-' + installedBuildId) {
    console.error('Confirmed cache pointer mismatch:', await page.evaluate(async ({ expectedConfirmedActive, installedVersion, installedBuildId }) => {
      const pointer = await caches.open('tha-active-pointer-v1');
      const active = await pointer.match(new URL('__tha_active_cache__', location.href));
      const pending = await pointer.match(new URL('__tha_pending_activation__', location.href));
      const keys = await caches.keys();
      const entries = {};
      for (const name of keys) {
        const cache = await caches.open(name);
        const response = await cache.match(new URL('index.html', location.href));
        if (response) {
          const html = await response.text();
          entries[name] = html.match(/meta name="app-version" content="([^"]+)/)?.[1] || 'unknown';
        }
      }
      return { expectedConfirmedActive: expectedConfirmedActive, current: active ? await active.json() : null, pending: pending ? await pending.json() : null, entries, startupDiagnostics: window.__thaPendingActivationDiagnostics };
    }, { expectedConfirmedActive: confirmedActive, installedVersion, installedBuildId }));
    throw new Error('Startup was confirmed but the active cache pointer does not identify the installed build.');
  }

  console.log('Pre-offline activation diagnostic:', await page.evaluate(async ({ installedVersion, installedBuildId }) => {
    const pointer = await caches.open('tha-active-pointer-v1');
    const active = await pointer.match(new URL('__tha_active_cache__', location.href));
    const pending = await pointer.match(new URL('__tha_pending_activation__', location.href));
    return {
      version: document.querySelector('meta[name="app-version"]')?.content,
      build: document.querySelector('meta[name="app-build-id"]')?.content,
      active: active ? await active.json() : null,
      pending: pending ? await pending.json() : null,
      expectedCache: 'tha-app-v' + installedVersion + '-' + installedBuildId,
      startupDiagnostics: window.__thaPendingActivationDiagnostics || null,
      status: document.getElementById('appUpdateStatus')?.textContent
    };
  }, { installedVersion, installedBuildId }));
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(expected => document.querySelector('meta[name="app-version"]')?.content === expected, installedVersion, { timeout: 10000 });
  } catch (error) {
    console.error('Offline reload diagnostic:', await page.evaluate(async () => {
      const pointer = await caches.open('tha-active-pointer-v1');
      const active = await pointer.match(new URL('__tha_active_cache__', location.href));
      const pending = await pointer.match(new URL('__tha_pending_activation__', location.href));
      return {
        url: location.href,
        version: document.querySelector('meta[name="app-version"]')?.content,
        controller: !!navigator.serviceWorker.controller,
        controllerScript: navigator.serviceWorker.controller?.scriptURL || null,
        active: active ? await active.json() : null,
        pending: pending ? await pending.json() : null,
        cacheNames: await caches.keys(),
        status: document.getElementById('appUpdateStatus')?.textContent
      };
    }));
    throw error;
  }
  const offline = await page.evaluate(() => ({
    version: document.querySelector('meta[name="app-version"]')?.content,
    saved: localStorage.getItem('tha_v206_accounting_v1'),
    title: document.title
  }));
  if (offline.version !== installedVersion || !preservesRecords(offline.saved)) throw new Error('Offline reload failed or saved records were not preserved.');

  // Simulate a new build that fails before it can confirm startup. On the next
  // navigation, the Service Worker must restore the previous known-good cache.
  await context.setOffline(false);
  await page.evaluate(async () => {
    const oldName = 'tha-app-v224-rollback-test';
    const failedName = 'tha-app-v999-rollback-test';
    const oldCache = await caches.open(oldName);
    const failedCache = await caches.open(failedName);
    // The Service Worker maps root navigations to the cached /index.html URL.
    const shellUrl = new URL('index.html', new URL('.', location.href));
    await oldCache.put(shellUrl, new Response('<!doctype html><html><head><meta name="app-version" content="224"><meta name="app-build-id" content="THA-224-ROLLBACK-TEST"></head><body>Previous stable app</body></html>', { headers: { 'content-type': 'text/html' } }));
    await failedCache.put(shellUrl, new Response('<!doctype html><html><head><meta name="app-version" content="999"><meta name="app-build-id" content="THA-999-FAILED-TEST"></head><body>Failed new app</body></html>', { headers: { 'content-type': 'text/html' } }));
    const pointer = await caches.open('tha-active-pointer-v1');
    await pointer.put(new URL('__tha_active_cache__', location.href), new Response(JSON.stringify({ cacheName: failedName })));
    await pointer.put(new URL('__tha_pending_activation__', location.href), new Response(JSON.stringify({
      previousCache: oldName, nextCache: failedName, version: '999', buildId: 'THA-999-FAILED-TEST', attempts: 1
    })));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => document.querySelector('meta[name="app-version"]')?.content === '224', null, { timeout: 10000 });
  } catch (error) {
    console.error('Rollback diagnostic:', await page.evaluate(async () => {
      const p = await caches.open('tha-active-pointer-v1');
      const a = await p.match(new URL('__tha_active_cache__', location.href));
      const r = await p.match(new URL('__tha_pending_activation__', location.href));
      return {
        url: location.href,
        version: document.querySelector('meta[name="app-version"]')?.content,
        controller: !!navigator.serviceWorker.controller,
        active: a ? await a.json() : null,
        pending: r ? await r.json() : null,
        cacheNames: await caches.keys()
      };
    }));
    throw error;
  }
  const rolledBack = await page.evaluate(async () => {
    const pointer = await caches.open('tha-active-pointer-v1');
    const active = await pointer.match(new URL('__tha_active_cache__', location.href));
    const pending = await pointer.match(new URL('__tha_pending_activation__', location.href));
    return { version: document.querySelector('meta[name="app-version"]')?.content, active: (await active.json()).cacheName, pending: !!pending, body: document.body.textContent };
  });
  if (rolledBack.version !== '224' || rolledBack.active !== 'tha-app-v224-rollback-test' || rolledBack.pending || !rolledBack.body.includes('Previous stable app')) {
    throw new Error('Automatic rollback did not restore the previous cached app after a failed startup.');
  }
  console.log('Updater browser test passed: v' + installedVersion + ' was staged and hash-verified from v' + previousVersion + ', installed only after confirmation, preserved accounting data, reopened offline, and restored the previous app cache after a simulated failed startup.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}