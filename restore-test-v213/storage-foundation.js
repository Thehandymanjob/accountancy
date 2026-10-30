/* The Handyman Accountancy v217 isolated-test storage foundation
   This module does NOT replace localStorage and does NOT delete app data.
   It creates an IndexedDB schema and provides explicit snapshot/verification APIs.
*/
(function () {
  "use strict";
  const DB_NAME = "tha_restore_test_foundation_v1";
  const DB_VERSION = 1;
  const LEGACY_KEYS = [
    "tha_restore_test_v1_accounting_v1",
    "tha_restore_test_v1_projects_v1",
    "tha_restore_test_v1_contracts_v1",
    "tha_restore_test_v1_factory_reset_recovery_v1"
  ];
  const STORES = ["legacySnapshots", "customers", "projects", "invoices", "contracts",
                  "accountingEntries", "projectReceipts", "projectExpenses", "auditLog"];

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("IndexedDB is unavailable"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: "id" });
            if (name === "legacySnapshots") store.createIndex("legacyKey", "legacyKey", { unique: false });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open IndexedDB"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another open tab"));
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
  }

  async function snapshotLegacyData() {
    const db = await openDatabase();
    const snapshots = [];
    try {
      for (const key of LEGACY_KEYS) {
        const raw = localStorage.getItem(key);
        if (raw === null) {
          snapshots.push({ legacyKey: key, present: false, byteLength: 0, validJson: null });
          continue;
        }
        let parsed;
        let validJson = true;
        try { parsed = JSON.parse(raw); } catch (_) { validJson = false; }
        const id = "snapshot:" + key;
        const record = {
          id, legacyKey: key, present: true, raw,
          byteLength: new Blob([raw]).size,
          validJson,
          capturedAt: new Date().toISOString()
        };
        const tx = db.transaction(["legacySnapshots"], "readwrite");
        tx.objectStore("legacySnapshots").put(record);
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error || new Error("Snapshot transaction failed"));
          tx.onabort = () => reject(tx.error || new Error("Snapshot transaction aborted"));
        });
        const readTx = db.transaction(["legacySnapshots"], "readonly");
        const stored = await requestResult(readTx.objectStore("legacySnapshots").get(id));
        if (!stored || stored.raw !== raw) throw new Error("Snapshot verification failed for " + key);
        snapshots.push({ legacyKey: key, present: true, byteLength: record.byteLength, validJson });
      }
      return { ok: true, database: DB_NAME, schemaVersion: DB_VERSION, snapshots };
    } finally {
      db.close();
    }
  }

  async function status() {
    const db = await openDatabase();
    try {
      const counts = {};
      for (const name of STORES) {
        const tx = db.transaction([name], "readonly");
        counts[name] = await requestResult(tx.objectStore(name).count());
      }
      return { ok: true, database: DB_NAME, schemaVersion: DB_VERSION, stores: counts };
    } finally { db.close(); }
  }

  window.HandymanStorageFoundation = Object.freeze({
    openDatabase,
    snapshotLegacyData,
    status,
    legacyKeys: LEGACY_KEYS.slice(),
    stores: STORES.slice()
  });
})();