/* The Handyman Accountancy — Backup v7 app adapter
 * Isolated bridge only. Not loaded by index.html.
 * Accounting-only scope. Does not read or write Projects, Company, Contracts,
 * production data, or browser storage unless explicitly supplied by the caller.
 */
(function (root) {
  'use strict';

  function create(options) {
    options = options || {};
    const backup = options.backupApi || root.HandymanBackupV7;
    const storage = options.storage;
    const readAccounting = options.readAccounting;
    const writeAccounting = options.writeAccounting;
    const refreshViews = options.refreshViews;

    if (!backup || typeof backup.validateBackup !== 'function' ||
        typeof backup.restoreBackup !== 'function') {
      throw new Error('Backup v7 module is not available.');
    }
    if (!storage || typeof storage.getItem !== 'function' ||
        typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
      throw new Error('A compatible storage adapter is required.');
    }
    if (typeof readAccounting !== 'function' ||
        typeof writeAccounting !== 'function' ||
        typeof refreshViews !== 'function') {
      throw new Error('Accounting read, write and refresh callbacks are required.');
    }

    async function restore(payload, confirmFn) {
      await backup.validateBackup(payload);

      const before = readAccounting();
      if (!before || !Array.isArray(before.entries) ||
          !Array.isArray(before.customers) || !Array.isArray(before.invoices) ||
          !before.settings || typeof before.settings !== 'object' ||
          Array.isArray(before.settings)) {
        throw new Error('Current in-memory Accounting data is invalid. Restore was not started.');
      }

      let appReloadAttempted = false;
      const reloadAccounting = async function () {
        appReloadAttempted = true;
        const raw = storage.getItem(backup.storageKeys.accounting);
        if (raw === null) throw new Error('Restored Accounting storage key is missing.');
        const imported = JSON.parse(raw);
        if (!imported || !Array.isArray(imported.entries) ||
            !Array.isArray(imported.customers) || !Array.isArray(imported.invoices) ||
            !imported.settings || typeof imported.settings !== 'object' ||
            Array.isArray(imported.settings)) {
          throw new Error('Restored Accounting data failed app-loader validation.');
        }
        writeAccounting(imported);
        await refreshViews();
        const reloaded = readAccounting();
        if (!reloaded || JSON.stringify(reloaded) !== JSON.stringify(imported)) {
          throw new Error('In-memory Accounting reload verification failed.');
        }
        return true;
      };

      try {
        const result = await backup.restoreBackup(payload, storage, confirmFn, reloadAccounting);
        if (result && result.restored !== true) return result;
        return Object.assign({}, result, {
          appReloaded: appReloadAttempted,
          scope: 'accounting-only'
        });
      } catch (error) {
        if (appReloadAttempted) {
          try {
            writeAccounting(before);
            await refreshViews();
            const rolledBack = readAccounting();
            if (!rolledBack || JSON.stringify(rolledBack) !== JSON.stringify(before)) {
              throw new Error('In-memory Accounting rollback verification failed.');
            }
          } catch (rollbackError) {
            throw new Error('CRITICAL: app memory rollback could not be verified. ' +
              'Preserve the recovery snapshot and stop using the app. ' + error.message +
              ' ' + rollbackError.message);
          }
        }
        throw error;
      }
    }

    return Object.freeze({ restore });
  }

  root.HandymanBackupV7AppAdapter = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
