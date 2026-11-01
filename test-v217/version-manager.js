/* The Handyman Accountancy - single authoritative updater. */
(function () {
  'use strict';
  const meta = (name) => document.querySelector('meta[name="' + name + '"]')?.content || '';
  const LOCAL_VERSION = meta('app-version');
  const LOCAL_BUILD = meta('app-build-id');
  let latest = null;
  const byId = (id) => document.getElementById(id);

  function compareVersion(a, b) {
    const aa = String(a || '').split(/[.+-]/).map(x => /^\d+$/.test(x) ? Number(x) : x);
    const bb = String(b || '').split(/[.+-]/).map(x => /^\d+$/.test(x) ? Number(x) : x);
    for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
      const x = aa[i] ?? 0, y = bb[i] ?? 0;
      if (x === y) continue;
      if (typeof x === 'number' && typeof y === 'number') return x > y ? 1 : -1;
      return String(x) > String(y) ? 1 : -1;
    }
    return 0;
  }
  function setStatus(message) {
    const el = byId('appUpdateStatus');
    if (el) el.textContent = message;
  }
  function setUpdateButton(enabled, label) {
    const button = byId('appReloadUpdate');
    if (!button) return;
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', String(!enabled));
    button.style.opacity = enabled ? '1' : '.55';
    button.style.cursor = enabled ? 'pointer' : 'not-allowed';
    button.style.filter = enabled ? 'none' : 'grayscale(.25)';
    button.textContent = label || 'Update Now';
  }
  async function sha256(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Cannot verify ' + url + ' (HTTP ' + response.status + ')');
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
  }

  window.checkForAppUpdate = async function () {
    const checkButton = document.querySelector('button[onclick="checkForAppUpdate(true)"]');
    const installed = byId('appInstalledVersion');
    if (installed) installed.textContent = 'Installed version: ' + LOCAL_VERSION + ' · ' + LOCAL_BUILD;
    latest = null;
    setUpdateButton(false, 'Update Now');
    setStatus('Checking the published version and verifying its files…');
    if (checkButton) { checkButton.disabled = true; checkButton.textContent = 'Checking…'; }
    try {
      const manifestUrl = new URL('version.json', document.baseURI);
      manifestUrl.searchParams.set('_check', String(Date.now()));
      const response = await fetch(manifestUrl, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('version.json HTTP ' + response.status);
      const manifest = await response.json();
      if (manifest.app !== 'The Handyman Accountancy' || !manifest.version || !manifest.buildId || !manifest.files || typeof manifest.files !== 'object') {
        throw new Error('The published version manifest is invalid.');
      }
      const names = Object.keys(manifest.files);
      if (!names.length) throw new Error('The manifest contains no files to verify.');
      for (const name of names) {
        const expected = manifest.files[name]?.sha256;
        if (!/^[a-f0-9]{64}$/i.test(String(expected || ''))) throw new Error('Missing or invalid SHA-256 for ' + name);
        const fileUrl = new URL(name, document.baseURI);
        fileUrl.searchParams.set('_verify', String(Date.now()));
        const actual = await sha256(fileUrl);
        if (actual.toLowerCase() !== String(expected).toLowerCase()) throw new Error('Integrity check failed: ' + name);
      }
      latest = manifest;
      const newer = compareVersion(manifest.version, LOCAL_VERSION) > 0 || manifest.buildId !== LOCAL_BUILD;
      setStatus('Installed: ' + LOCAL_VERSION + ' (' + LOCAL_BUILD + '). Published: ' + manifest.version + ' (' + manifest.buildId + '). All ' + names.length + ' file hashes verified. ' + (newer ? 'A newer build is ready. Select Update Now to load it.' : 'This build is current.'));
      setUpdateButton(newer, 'Update Now');
      if (!newer && checkButton) { /* leave the successful check visible */ }
    } catch (error) {
      latest = null;
      setUpdateButton(false, 'Update Now');
      setStatus('Update check failed: ' + (error?.message || 'Unknown error') + '. No saved data was changed.');
    } finally {
      if (checkButton) { checkButton.disabled = false; checkButton.textContent = '🔄 Check for Updates'; }
    }
  };

  window.reloadLatestApp = function () {
    if (!latest) {
      setStatus('Please check for updates and verify the published files before updating.');
      setUpdateButton(false, 'Update Now');
      return;
    }
    if (compareVersion(latest.version, LOCAL_VERSION) <= 0 && latest.buildId === LOCAL_BUILD) {
      setStatus('This installation is already on the published build.');
      setUpdateButton(false, 'Update Now');
      return;
    }
    const button = byId('appReloadUpdate');
    if (button) { button.disabled = true; button.setAttribute('aria-disabled', 'true'); button.textContent = 'Loading…'; }
    setStatus('Loading published version ' + latest.version + '. Your saved records remain in this browser.');
    const target = new URL(location.href);
    ['app-refresh', 'app-update-confirm', 'app-cache-bust', 'app-launch-refresh', 'app-published-version'].forEach(k => target.searchParams.delete(k));
    target.searchParams.set('tha-update', latest.buildId);
    target.searchParams.set('tha-cache-bust', String(Date.now()));
    target.hash = '';
    location.replace(target.toString());
  };

  const installed = byId('appInstalledVersion');
  if (installed) installed.textContent = 'Installed version: ' + LOCAL_VERSION + ' · ' + LOCAL_BUILD;
  setUpdateButton(false, 'Update Now');
})();
