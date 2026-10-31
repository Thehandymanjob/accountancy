/* The Handyman Accountancy — Backup v7 isolated module
 * Design implementation; not loaded by index.html.
 * Company data/code is deliberately excluded.
 */
(function (root) {
  'use strict';

  const APP = 'The Handyman Accountancy';
  const SCHEMA = 7;
  const KEYS = Object.freeze({
    accounting: 'tha_v212_migration_accounting_v1',
    projects: 'tha_v212_migration_projects_v1',
    businessProfile: 'tha_v212_migration_business_profile_v1',
    invoiceSequence: 'tha_v212_migration_invoice_sequence_v1',
    reportArchive: 'tha_v212_migration_report_archive_v1',
    reportEmailSettings: 'tha_v212_migration_report_email_settings_v1',
    reportNotifications: 'tha_v212_migration_report_notifications_v1',
    reportSettings: 'tha_v212_migration_report_settings_v1',
    reportWorkflow: 'tha_v212_migration_report_workflow_v1',
    appLanguage: 'tha_v212_migration_app_language_v1',
    appLanguagePrefVersion: 'tha_v212_migration_app_language_pref_version_v1'
  });

  const REQUIRED = ['accounting', 'projects', 'businessProfile', 'invoiceSequence'];
  const OPTIONAL = [
    'reportArchive', 'reportEmailSettings', 'reportNotifications',
    'reportSettings', 'reportWorkflow', 'appLanguage',
    'appLanguagePrefVersion'
  ];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const RAW_STRING_KEYS = new Set(['appLanguage']);
  const RAW_NUMBER_KEYS = new Set(['invoiceSequence', 'appLanguagePrefVersion']);

  function readStored(storage, name) {
    const raw = storage.getItem(KEYS[name]);
    if (raw === null) return { present: false, value: null, raw: null };
    if (RAW_STRING_KEYS.has(name)) return { present: true, value: raw, raw };
    if (RAW_NUMBER_KEYS.has(name)) {
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error('Stored numeric setting is invalid: ' + name);
      }
      return { present: true, value, raw };
    }
    return { present: true, value: JSON.parse(raw), raw };
  }

  function writeStored(storage, name, value) {
    if (RAW_STRING_KEYS.has(name)) {
      if (typeof value !== 'string') throw new Error(name + ' must be a string.');
      storage.setItem(KEYS[name], value);
    } else if (RAW_NUMBER_KEYS.has(name)) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(name + ' must be a non-negative safe integer.');
      }
      storage.setItem(KEYS[name], String(value));
    } else if (value === null && name === 'businessProfile') {
      storage.removeItem(KEYS[name]);
    } else {
      storage.setItem(KEYS[name], JSON.stringify(value));
    }
  }

  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(v => canonical(v) ?? 'null').join(',') + ']';
    return '{' + Object.keys(value).sort().map(k =>
      JSON.stringify(k) + ':' + (canonical(value[k]) ?? 'null')
    ).join(',') + '}';
  }

  async function digest(value) {
    if (!root.crypto || !root.crypto.subtle || typeof TextEncoder === 'undefined') {
      throw new Error('SHA-256 is unavailable in this browser context. No backup was created.');
    }
    const bytes = new TextEncoder().encode(canonical(value));
    const hash = await root.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  }

  function parseStored(storage, name) {
    return readStored(storage, name);
  }

  function validateSection(name, value) {
    if (name === 'accounting') {
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
          !Array.isArray(value.entries) || !Array.isArray(value.customers) ||
          !Array.isArray(value.invoices) || !value.settings ||
          typeof value.settings !== 'object' || Array.isArray(value.settings)) {
        throw new Error('Accounting section is missing or invalid.');
      }
    } else if (name === 'projects') {
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
          !Array.isArray(value.projects) || !Array.isArray(value.workers)) {
        throw new Error('Projects section is missing or invalid.');
      }
    } else if (name === 'businessProfile') {
      if (value !== null && (!value || typeof value !== 'object' || Array.isArray(value))) {
        throw new Error('Business profile section is invalid.');
      }
    } else if (name === 'invoiceSequence') {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error('Invoice sequence must be a non-negative safe integer.');
      }
    } else if (RAW_STRING_KEYS.has(name)) {
      if (value !== null && typeof value !== 'string') {
        throw new Error(name + ' section must be a string or null.');
      }
    } else if (RAW_NUMBER_KEYS.has(name)) {
      if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
        throw new Error(name + ' section must be a non-negative safe integer or null.');
      }
    } else if (value !== null && typeof value !== 'object') {
      throw new Error(name + ' section has an unsupported type.');
    }
  }

  function sharedRecordHighWater(accounting, storedSequence) {
    const values = [142, 134, Number(storedSequence) || 0];
    for (const invoice of accounting.invoices) values.push(Number(invoice && invoice.number) || 0);
    for (const entry of accounting.entries) {
      if (entry && entry.type === 'income') values.push(Number(entry.number) || 0);
    }
    return Math.max(...values);
  }

  function recordCount(name, value) {
    if (name === 'accounting') return {
      entries: value.entries.length, customers: value.customers.length,
      invoices: value.invoices.length
    };
    if (name === 'projects') return {
      projects: value.projects.length, workers: value.workers.length
    };
    if (Array.isArray(value)) return { records: value.length };
    return { present: value !== null };
  }

  async function buildBackup(storage, appVersion) {
    const data = {};
    const settings = {};
    for (const name of REQUIRED) {
      const stored = parseStored(storage, name);
      if (name === 'businessProfile' && !stored.present) stored.value = null;
      if (name === 'invoiceSequence' && !stored.present) stored.value = 0;
      if (name !== 'businessProfile' && name !== 'invoiceSequence' && !stored.present) {
        throw new Error('Required data is absent: ' + name + '. Export cancelled.');
      }
      validateSection(name, stored.value);
      data[name] = stored.value;
    }

    // The app uses one shared sequence for invoice numbers and standalone income records.
    // Never trust the remembered counter alone: derive its high-water mark from actual records.
    const accounting = data.accounting;
    const invoiceNumbers = Array.isArray(accounting.invoices)
      ? accounting.invoices.map(item => Number(item && item.number) || 0) : [];
    const incomeNumbers = Array.isArray(accounting.entries)
      ? accounting.entries.filter(item => item && item.type === 'income')
          .map(item => Number(item.number) || 0) : [];
    data.invoiceSequence = Math.max(
      142,
      Number(data.invoiceSequence) || 0,
      ...invoiceNumbers,
      ...incomeNumbers
    );

    for (const name of OPTIONAL) {
      const stored = parseStored(storage, name);
      const value = stored.present ? stored.value : null;
      validateSection(name, value);
      settings[name] = { present: stored.present, value };
    }

    const sections = {};
    for (const name of REQUIRED) {
      sections[name] = {
        sha256: await digest(data[name]),
        recordCounts: recordCount(name, data[name])
      };
    }
    for (const name of OPTIONAL) {
      sections[name] = {
        sha256: await digest(settings[name]),
        recordCounts: recordCount(name, settings[name].value),
        present: settings[name].present
      };
    }

    const payload = {
      app: APP,
      backupType: 'complete-user-data',
      backupSchemaVersion: SCHEMA,
      appVersion: String(appVersion || 'unknown'),
      createdAt: new Date().toISOString(),
      data,
      settings,
      integrity: { algorithm: 'SHA-256', sections }
    };
    const serialized = JSON.stringify(payload, null, 2);
    const parsed = JSON.parse(serialized);
    for (const name of REQUIRED) {
      if (await digest(parsed.data[name]) !== parsed.integrity.sections[name].sha256) {
        throw new Error('Generated backup verification failed: ' + name);
      }
    }
    for (const name of OPTIONAL) {
      if (await digest(parsed.settings[name]) !== parsed.integrity.sections[name].sha256) {
        throw new Error('Generated backup verification failed: ' + name);
      }
    }
    return { payload: parsed, serialized };
  }

  async function validateBackup(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        payload.app !== APP || payload.backupType !== 'complete-user-data' ||
        payload.backupSchemaVersion !== SCHEMA ||
        !payload.data || !payload.settings || !payload.integrity ||
        payload.integrity.algorithm !== 'SHA-256' ||
        !payload.integrity.sections) {
      throw new Error('Unsupported or invalid Backup v7 file.');
    }
    for (const name of REQUIRED) {
      if (!own(payload.data, name) || !own(payload.integrity.sections, name)) {
        throw new Error('Required backup section is missing: ' + name);
      }
      validateSection(name, payload.data[name]);
      if (canonical(recordCount(name, payload.data[name])) !==
          canonical(payload.integrity.sections[name].recordCounts)) {
        throw new Error('Record-count check failed: ' + name);
      }
      if (await digest(payload.data[name]) !== payload.integrity.sections[name].sha256) {
        throw new Error('Integrity check failed: ' + name);
      }
    }
    for (const name of OPTIONAL) {
      if (!own(payload.settings, name) || !own(payload.integrity.sections, name)) {
        throw new Error('Settings section is missing: ' + name);
      }
      const item = payload.settings[name];
      if (!item || typeof item.present !== 'boolean' || !own(item, 'value')) {
        throw new Error('Invalid settings section: ' + name);
      }
      validateSection(name, item.value);
      if (canonical(recordCount(name, item.value)) !==
          canonical(payload.integrity.sections[name].recordCounts) ||
          item.present !== payload.integrity.sections[name].present) {
        throw new Error('Settings record-count/presence check failed: ' + name);
      }
      if (await digest(item) !== payload.integrity.sections[name].sha256) {
        throw new Error('Integrity check failed: ' + name);
      }
    }
    return true;
  }

  async function restoreBackup(payload, storage, confirmFn) {
    await validateBackup(payload);
    if (typeof confirmFn !== 'function' ||
        !confirmFn('Restore Backup v7? Current accounting, projects, profile, invoice sequence and report settings will be replaced.')) {
      return { restored: false, reason: 'cancelled' };
    }

    const targetNames = REQUIRED.concat(OPTIONAL);
    const previous = {};
    const previousRaw = {};
    for (const name of targetNames) {
      const stored = readStored(storage, name);
      previousRaw[KEYS[name]] = stored.raw;
      previous[name] = stored.value;
    }

    const recoveryKey = 'tha_v212_migration_restore_recovery_v1';
    if (storage.getItem(recoveryKey) !== null) {
      throw new Error('An existing recovery snapshot is present. Preserve it and resolve it before starting another restore.');
    }
    const recovery = {
      schema: 1,
      createdAt: new Date().toISOString(),
      keys: previousRaw
    };
    const recoveryText = JSON.stringify(recovery);
    storage.setItem(recoveryKey, recoveryText);
    if (storage.getItem(recoveryKey) !== recoveryText) {
      throw new Error('Recovery snapshot could not be verified. Restore cancelled.');
    }

    let commitStarted = false;
    try {
      commitStarted = true;
      for (const name of REQUIRED) {
        const value = payload.data[name];
        if (name === 'invoiceSequence') {
          const current = Number(previous.invoiceSequence) || 0;
          writeStored(storage, name, sharedRecordHighWater(payload.data.accounting, Math.max(current, value)));
        } else {
          writeStored(storage, name, value);
        }
      }
      for (const name of OPTIONAL) {
        const item = payload.settings[name];
        if (item.present) writeStored(storage, name, item.value);
        else storage.removeItem(KEYS[name]);
      }

      for (const name of REQUIRED) {
        const raw = storage.getItem(KEYS[name]);
        const actual = raw === null ? null : readStored(storage, name).value;
        const expected = name === 'invoiceSequence'
          ? sharedRecordHighWater(payload.data.accounting, Math.max(Number(previous.invoiceSequence) || 0, payload.data.invoiceSequence))
          : payload.data[name];
        if (canonical(actual) !== canonical(expected)) {
          throw new Error('Post-restore verification failed: ' + name);
        }
      }
      for (const name of OPTIONAL) {
        const item = payload.settings[name];
        const raw = storage.getItem(KEYS[name]);
        if (item.present) {
          if (raw === null || canonical(readStored(storage, name).value) !== canonical(item.value)) {
            throw new Error('Post-restore verification failed: ' + name);
          }
        } else if (raw !== null) {
          throw new Error('Post-restore removal verification failed: ' + name);
        }
      }

      return { restored: true, recoveryKey, note: 'Recovery snapshot retained until separately confirmed safe to remove.' };
    } catch (error) {
      let rollbackOk = true;
      if (commitStarted) {
        try {
          for (const name of targetNames) {
            const key = KEYS[name];
            const raw = previousRaw[key];
            if (raw === null) storage.removeItem(key);
            else storage.setItem(key, raw);
          }
          for (const name of targetNames) {
            if (storage.getItem(KEYS[name]) !== previousRaw[KEYS[name]]) {
              throw new Error('Rollback verification failed: ' + name);
            }
          }
        } catch (rollbackError) {
          rollbackOk = false;
        }
      }
      if (rollbackOk) {
        try { storage.removeItem(recoveryKey); } catch (_) {}
        throw new Error('Restore failed; previous data rollback was verified. ' + error.message);
      }
      throw new Error('CRITICAL: restore and rollback could not be verified. Keep recovery snapshot ' +
        recoveryKey + ' and do not edit or clear browser storage. Original error: ' + error.message);
    }
  }

  async function exportToDownload(storage, appVersion) {
    const result = await buildBackup(storage, appVersion);
    const blob = new Blob([result.serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'The_Handyman_Backup_v7_' +
      new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { initiated: true, verified: true, message: 'Download initiated. Confirm the file exists in Files before resetting or replacing data.' };
  }

  root.HandymanBackupV7 = Object.freeze({
    schemaVersion: SCHEMA,
    storageKeys: KEYS,
    buildBackup,
    validateBackup,
    restoreBackup,
    exportToDownload
  });
})(typeof window !== 'undefined' ? window : globalThis);
