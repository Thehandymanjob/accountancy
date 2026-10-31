/* The Handyman Accountancy — Backup v7 Accounting-only module
 * Isolated implementation; not integrated into index.html.
 * Projects, Company, Contracts, business profile and their storage are excluded.
 */
(function (root) {
  'use strict';
  const APP = 'The Handyman Accountancy';
  const SCHEMA = 7;
  const KEYS = Object.freeze({
    accounting: 'tha_v212_migration_accounting_v1',
    invoiceSequence: 'tha_v212_migration_invoice_sequence_v1',
    reportArchive: 'tha_v212_migration_report_archive_v1',
    reportEmailSettings: 'tha_v212_migration_report_email_settings_v1',
    reportNotifications: 'tha_v212_migration_report_notifications_v1',
    reportSettings: 'tha_v212_migration_report_settings_v1',
    reportWorkflow: 'tha_v212_migration_report_workflow_v1'
  });
  const REQUIRED = ['accounting', 'invoiceSequence'];
  const OPTIONAL = ['reportArchive', 'reportEmailSettings', 'reportNotifications', 'reportSettings', 'reportWorkflow'];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function readStored(storage, name) {
    const raw = storage.getItem(KEYS[name]);
    if (raw === null) return { present: false, value: name === 'invoiceSequence' ? 0 : null, raw: null };
    if (name === 'invoiceSequence') {
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Stored invoice sequence is invalid.');
      return { present: true, value, raw };
    }
    return { present: true, value: JSON.parse(raw), raw };
  }
  function writeStored(storage, name, value) {
    if (name === 'invoiceSequence') {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invoice sequence must be a non-negative safe integer.');
      storage.setItem(KEYS[name], String(value));
    } else storage.setItem(KEYS[name], JSON.stringify(value));
  }
  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(v => canonical(v) ?? 'null').join(',') + ']';
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + (canonical(value[k]) ?? 'null')).join(',') + '}';
  }
  async function digest(value) {
    if (!root.crypto || !root.crypto.subtle || typeof TextEncoder === 'undefined') {
      throw new Error('SHA-256 unavailable. No backup or restore was performed.');
    }
    const bytes = new TextEncoder().encode(canonical(value));
    const hash = await root.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  }
  function validateSection(name, value) {
    if (name === 'accounting') {
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
          !Array.isArray(value.entries) || !Array.isArray(value.customers) ||
          !Array.isArray(value.invoices) || !value.settings ||
          typeof value.settings !== 'object' || Array.isArray(value.settings)) {
        throw new Error('Accounting section is missing or invalid.');
      }
    } else if (name === 'invoiceSequence') {
      if (!Number.isSafeInteger(value) || value < 142) throw new Error('Invoice sequence must be a safe integer of at least 142.');
    } else if (value !== null && typeof value !== 'object') {
      throw new Error('Invalid report setting: ' + name);
    }
  }
  function highestRecordNumber(accounting, storedSequence) {
    const values = [142, 134, Number(storedSequence) || 0];
    for (const invoice of accounting.invoices) values.push(Number(invoice && invoice.number) || 0);
    for (const entry of accounting.entries) if (entry && entry.type === 'income') values.push(Number(entry.number) || 0);
    return Math.max(...values);
  }
  function counts(name, value) {
    if (name === 'accounting') return { entries: value.entries.length, customers: value.customers.length, invoices: value.invoices.length };
    return Array.isArray(value) ? { records: value.length } : { present: value !== null };
  }

  async function buildBackup(storage, appVersion) {
    const acc = readStored(storage, 'accounting');
    if (!acc.present) throw new Error('Accounting data is absent. Export cancelled.');
    validateSection('accounting', acc.value);
    const seq = readStored(storage, 'invoiceSequence');
    const data = {
      accounting: acc.value,
      invoiceSequence: highestRecordNumber(acc.value, seq.value)
    };
    validateSection('invoiceSequence', data.invoiceSequence);
    const settings = {};
    const sections = {};
    for (const name of REQUIRED) sections[name] = { sha256: await digest(data[name]), recordCounts: counts(name, data[name]) };
    for (const name of OPTIONAL) {
      const item = readStored(storage, name);
      const value = item.present ? item.value : null;
      validateSection(name, value);
      settings[name] = { present: item.present, value };
      sections[name] = { sha256: await digest(settings[name]), recordCounts: counts(name, value), present: item.present };
    }
    const payload = {
      app: APP, backupType: 'accounting-only', backupSchemaVersion: SCHEMA,
      appVersion: String(appVersion || 'unknown'), createdAt: new Date().toISOString(),
      data, settings, integrity: { algorithm: 'SHA-256', sections }
    };
    const serialized = JSON.stringify(payload, null, 2);
    const check = JSON.parse(serialized);
    await validateBackup(check);
    return { payload: check, serialized };
  }

  async function validateBackup(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        payload.app !== APP || payload.backupType !== 'accounting-only' ||
        payload.backupSchemaVersion !== SCHEMA || !payload.data || !payload.settings ||
        !payload.integrity || payload.integrity.algorithm !== 'SHA-256' || !payload.integrity.sections) {
      throw new Error('Unsupported or invalid Accounting-only Backup v7 file.');
    }
    for (const name of REQUIRED) {
      if (!own(payload.data, name) || !own(payload.integrity.sections, name)) throw new Error('Required section missing: ' + name);
      validateSection(name, payload.data[name]);
      const meta = payload.integrity.sections[name];
      if (canonical(counts(name, payload.data[name])) !== canonical(meta.recordCounts) ||
          await digest(payload.data[name]) !== meta.sha256) throw new Error('Accounting integrity check failed: ' + name);
    }
    for (const name of OPTIONAL) {
      if (!own(payload.settings, name) || !own(payload.integrity.sections, name)) throw new Error('Report setting missing: ' + name);
      const item = payload.settings[name], meta = payload.integrity.sections[name];
      if (!item || typeof item.present !== 'boolean' || !own(item, 'value')) throw new Error('Invalid report setting envelope: ' + name);
      validateSection(name, item.value);
      if (canonical(counts(name, item.value)) !== canonical(meta.recordCounts) ||
          item.present !== meta.present || await digest(item) !== meta.sha256) throw new Error('Report setting integrity check failed: ' + name);
    }
    return true;
  }

  async function restoreBackup(payload, storage, confirmFn, reloadAccounting) {
    await validateBackup(payload);
    if (typeof confirmFn !== 'function' ||
        !confirmFn('Restore Accounting-only Backup v7? Accounting, shared invoice sequence and report settings will be replaced. Projects and other sections will not be touched.')) {
      return { restored: false, reason: 'cancelled' };
    }
    const targets = REQUIRED.concat(OPTIONAL);
    const previousRaw = {};
    for (const name of targets) previousRaw[KEYS[name]] = storage.getItem(KEYS[name]);
    const recoveryKey = 'tha_v212_migration_restore_recovery_v1';
    if (storage.getItem(recoveryKey) !== null) throw new Error('An existing recovery snapshot is present. Preserve it and resolve it before another restore.');
    const recoveryText = JSON.stringify({ schema: 2, scope: 'accounting-only', createdAt: new Date().toISOString(), keys: previousRaw });
    storage.setItem(recoveryKey, recoveryText);
    if (storage.getItem(recoveryKey) !== recoveryText) throw new Error('Recovery snapshot verification failed. Restore cancelled.');
    try {
      writeStored(storage, 'accounting', payload.data.accounting);
      const safeSequence = highestRecordNumber(payload.data.accounting,
        Math.max(readStored(storage, 'invoiceSequence').value, payload.data.invoiceSequence));
      writeStored(storage, 'invoiceSequence', safeSequence);
      for (const name of OPTIONAL) {
        const item = payload.settings[name];
        if (item.present) writeStored(storage, name, item.value);
        else storage.removeItem(KEYS[name]);
      }
      for (const name of targets) {
        const expected = name === 'accounting' ? payload.data.accounting :
          name === 'invoiceSequence' ? safeSequence :
          (payload.settings[name].present ? payload.settings[name].value : null);
        const actual = readStored(storage, name);
        if (canonical(actual.value) !== canonical(expected) ||
            (name !== 'invoiceSequence' && actual.present !== payload.settings[name]?.present && OPTIONAL.includes(name))) {
          throw new Error('Post-restore verification failed: ' + name);
        }
      }
      if (typeof reloadAccounting === 'function') {
        const result = await reloadAccounting();
        if (result === false) throw new Error('Application Accounting reload failed.');
      }
      return { restored: true, recoveryKey, note: 'Recovery snapshot retained for manual verification.' };
    } catch (error) {
      let rollbackOk = true;
      try {
        for (const name of targets) {
          const key = KEYS[name], raw = previousRaw[key];
          if (raw === null) storage.removeItem(key); else storage.setItem(key, raw);
        }
        for (const name of targets) if (storage.getItem(KEYS[name]) !== previousRaw[KEYS[name]]) throw new Error('Rollback verification failed: ' + name);
      } catch (_) { rollbackOk = false; }
      if (rollbackOk) {
        try { storage.removeItem(recoveryKey); } catch (_) {}
        throw new Error('Restore failed; previous Accounting data rollback was verified. ' + error.message);
      }
      throw new Error('CRITICAL: rollback could not be verified. Keep recovery snapshot ' + recoveryKey + ' and do not edit browser storage. ' + error.message);
    }
  }

  async function exportToDownload(storage, appVersion) {
    const result = await buildBackup(storage, appVersion);
    const blob = new Blob([result.serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = 'The_Handyman_Accounting_Backup_v7_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { initiated: true, verified: true, message: 'Download initiated. Confirm the file exists in Files before resetting or replacing data.' };
  }

  root.HandymanBackupV7 = Object.freeze({
    schemaVersion: SCHEMA, scope: 'accounting-only', storageKeys: KEYS,
    buildBackup, validateBackup, restoreBackup, exportToDownload
  });
})(typeof window !== 'undefined' ? window : globalThis);
