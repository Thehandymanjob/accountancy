/* The Handyman Accountancy v233 - non-destructive IndexedDB foundation.
   This module is an isolated storage layer. It does not change app persistence
   automatically and never deletes or modifies legacy LocalStorage values.
*/
(function () {
  "use strict";
  const DB_NAME = "the_handyman_accountancy_test226";
  const DB_VERSION = 5;
  const PREFIX = "tha_test226_";
  const LEGACY_KEYS = [
    "tha_test226_accounting_v1",
    "tha_test226_contracts_v1",
    "tha_test226_projects_v1",
    "tha_test226_factory_reset_recovery_v1"
  ];
  const STORES = ["legacySnapshots", "customers", "projects", "invoices", "contracts",
    "accountingEntries", "projectReceipts", "projectExpenses", "workers", "partners",
    "contractors", "companies", "companyJobs", "customExpenseCategories",
    "thirdPartyTransactions", "accountingSettings", "projectMetadata", "auditLog", "recordOrder", "appState"];
  const KV_STORE = "kv";

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
        if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE, { keyPath: "key" });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
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

  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => { const e = tx.error; reject(new Error("IndexedDB transaction failed" + (e && e.name ? " (" + e.name + ")" : "") + (e && e.message ? ": " + e.message : ""))); };
      tx.onabort = () => { const e = tx.error; reject(new Error("IndexedDB transaction aborted" + (e && e.name ? " (" + e.name + ")" : "") + (e && e.message ? ": " + e.message : ""))); };
    });
  }

  function enumerateLegacyKeys() {
    // Snapshot/migration scope must match the all-origin inventory. Capture
    // every same-origin LocalStorage key, while retaining known absent keys
    // as explicit "not present" entries for auditability.
    const found = new Set(LEGACY_KEYS);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) found.add(key);
    }
    return [...found].sort();
  }

  async function get(key) {
    const db = await openDatabase();
    try {
      const tx = db.transaction([KV_STORE], "readonly");
      const record = await requestResult(tx.objectStore(KV_STORE).get(String(key)));
      return record ? record.value : null;
    } finally { db.close(); }
  }

  async function set(key, value) {
    const db = await openDatabase();
    try {
      const normalizedKey = String(key);
      const normalizedValue = String(value);
      const tx = db.transaction([KV_STORE], "readwrite");
      tx.objectStore(KV_STORE).put({
        key: normalizedKey,
        value: normalizedValue,
        byteLength: new Blob([normalizedValue]).size,
        updatedAt: new Date().toISOString()
      });
      await transactionDone(tx);
      const verifyTx = db.transaction([KV_STORE], "readonly");
      const saved = await requestResult(verifyTx.objectStore(KV_STORE).get(normalizedKey));
      if (!saved || saved.value !== normalizedValue) throw new Error("IndexedDB write verification failed for " + normalizedKey);
      return true;
    } finally { db.close(); }
  }

  async function remove(key) {
    const db = await openDatabase();
    try {
      const tx = db.transaction([KV_STORE], "readwrite");
      tx.objectStore(KV_STORE).delete(String(key));
      await transactionDone(tx);
      const verifyTx = db.transaction([KV_STORE], "readonly");
      const saved = await requestResult(verifyTx.objectStore(KV_STORE).get(String(key)));
      if (saved) throw new Error("IndexedDB delete verification failed for " + key);
      return true;
    } finally { db.close(); }
  }

  async function keys() {
    const db = await openDatabase();
    try {
      const tx = db.transaction([KV_STORE], "readonly");
      return await requestResult(tx.objectStore(KV_STORE).getAllKeys());
    } finally { db.close(); }
  }


  function assertRecordStore(name) {
    if (!STORES.includes(name) || name === "legacySnapshots") {
      throw new Error("Unsupported operational IndexedDB store: " + name);
    }
    return name;
  }

  function validateRecord(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error("IndexedDB record must be an object.");
    }
    if (typeof record.id !== "string" && !(typeof record.id === "number" && Number.isFinite(record.id))) {
      throw new Error("IndexedDB record requires a non-empty string or finite numeric id.");
    }
    if (String(record.id).trim() === "") throw new Error("IndexedDB record id cannot be empty.");
    return record;
  }

  async function putRecord(storeName, record) {
    assertRecordStore(storeName);
    validateRecord(record);
    const db = await openDatabase();
    try {
      const tx = db.transaction([storeName], "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(storeName).put(record);
      await done;
      const saved = await getRecord(storeName, record.id);
      if (!saved || saved.id !== record.id || JSON.stringify(saved) !== JSON.stringify(record)) {
        throw new Error("IndexedDB record write verification failed for " + storeName + "/" + record.id);
      }
      return { ok: true, store: storeName, id: record.id };
    } finally { db.close(); }
  }

  async function getRecord(storeName, id) {
    assertRecordStore(storeName);
    const db = await openDatabase();
    try {
      const tx = db.transaction([storeName], "readonly");
      const done = transactionDone(tx);
      const result = await requestResult(tx.objectStore(storeName).get(id));
      await done;
      return result || null;
    } finally { db.close(); }
  }

  async function getAllRecords(storeName) {
    assertRecordStore(storeName);
    const db = await openDatabase();
    try {
      const tx = db.transaction([storeName], "readonly");
      const done = transactionDone(tx);
      const result = await requestResult(tx.objectStore(storeName).getAll());
      await done;
      return result;
    } finally { db.close(); }
  }

  async function countRecords(storeName) {
    assertRecordStore(storeName);
    const db = await openDatabase();
    try {
      const tx = db.transaction([storeName], "readonly");
      const done = transactionDone(tx);
      const count = await requestResult(tx.objectStore(storeName).count());
      await done;
      return count;
    } finally { db.close(); }
  }

  async function deleteRecord(storeName, id) {
    assertRecordStore(storeName);
    const db = await openDatabase();
    try {
      const tx = db.transaction([storeName], "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(storeName).delete(id);
      await done;
      const remaining = await getRecord(storeName, id);
      if (remaining !== null) throw new Error("IndexedDB record delete verification failed for " + storeName + "/" + id);
      return { ok: true, store: storeName, id };
    } finally { db.close(); }
  }

  async function bulkPutRecords(storeName, records) {
    assertRecordStore(storeName);
    if (!Array.isArray(records)) throw new Error("Bulk IndexedDB write requires an array.");
    const ids = new Set();
    for (const record of records) {
      validateRecord(record);
      const id = String(record.id);
      if (ids.has(id)) throw new Error("Duplicate record id in bulk write: " + id);
      ids.add(id);
    }
    const db = await openDatabase();
    try {
      const tx = db.transaction([storeName], "readwrite");
      const done = transactionDone(tx);
      const store = tx.objectStore(storeName);
      for (const record of records) store.put(record);
      await done;
      const verified = await Promise.all(records.map(record => getRecord(storeName, record.id)));
      for (let i = 0; i < records.length; i++) {
        if (!verified[i] || JSON.stringify(verified[i]) !== JSON.stringify(records[i])) {
          throw new Error("IndexedDB bulk write verification failed for " + storeName + "/" + records[i].id);
        }
      }
      return { ok: true, store: storeName, written: records.length };
    } finally { db.close(); }
  }

  async function bulkAddAcrossStores(recordsByStore) {
    if (!recordsByStore || typeof recordsByStore !== "object" || Array.isArray(recordsByStore)) {
      throw new Error("Cross-store write requires a store-to-records object.");
    }
    const storeNames = Object.keys(recordsByStore);
    if (!storeNames.length) throw new Error("Cross-store write contains no stores.");
    for (const name of storeNames) {
      assertRecordStore(name);
      if (!Array.isArray(recordsByStore[name])) throw new Error("Records for " + name + " must be an array.");
      const ids = new Set();
      for (const record of recordsByStore[name]) {
        validateRecord(record);
        const id = String(record.id);
        if (ids.has(id)) throw new Error("Duplicate record id in " + name + ": " + id);
        ids.add(id);
      }
    }
    const db = await openDatabase();
    try {
      const tx = db.transaction(storeNames, "readwrite");
      const done = transactionDone(tx);
      for (const name of storeNames) {
        const store = tx.objectStore(name);
        for (const record of recordsByStore[name]) store.add(record);
      }
      await done;
      const verification = {};
      for (const name of storeNames) {
        verification[name] = [];
        for (const record of recordsByStore[name]) {
          const saved = await getRecord(name, record.id);
          if (!saved || JSON.stringify(saved) !== JSON.stringify(record)) {
            throw new Error("Cross-store write verification failed for " + name + "/" + record.id);
          }
          verification[name].push(record.id);
        }
      }
      return { ok: true, atomic: true, stores: storeNames, written: Object.values(recordsByStore).reduce((n, rows) => n + rows.length, 0), verification };
    } finally { db.close(); }
  }

  async function bulkAddAcrossStoresVerified(recordsByStore) {
    if (!recordsByStore || typeof recordsByStore !== "object" || Array.isArray(recordsByStore)) {
      throw new Error("Verified cross-store write requires a store-to-records object.");
    }
    const storeNames = Object.keys(recordsByStore);
    if (!storeNames.length) throw new Error("Verified cross-store write contains no stores.");
    for (const name of storeNames) {
      assertRecordStore(name);
      if (!Array.isArray(recordsByStore[name])) throw new Error("Records for " + name + " must be an array.");
      const ids = new Set();
      for (const record of recordsByStore[name]) {
        validateRecord(record);
        const id = String(record.id);
        if (ids.has(id)) throw new Error("Duplicate record id in " + name + ": " + id);
        ids.add(id);
      }
    }
    const db = await openDatabase();
    try {
      const tx = db.transaction(storeNames, "readwrite");
      const done = transactionDone(tx);
      const verification = {};
      for (const name of storeNames) {
        verification[name] = [];
        const store = tx.objectStore(name);
        for (const record of recordsByStore[name]) {
          const addRequest = store.add(record);
          addRequest.onsuccess = () => {
            const readRequest = store.get(record.id);
            readRequest.onsuccess = () => {
              if (!readRequest.result || JSON.stringify(readRequest.result) !== JSON.stringify(record)) {
                try { tx.abort(); } catch (_) {}
                return;
              }
              verification[name].push(record.id);
            };
            readRequest.onerror = () => { try { tx.abort(); } catch (_) {} };
          };
          addRequest.onerror = () => { try { tx.abort(); } catch (_) {} };
        }
      }
      await done;
      const written = Object.values(recordsByStore).reduce((n, rows) => n + rows.length, 0);
      const verified = Object.values(verification).reduce((n, ids) => n + ids.length, 0);
      if (verified !== written) throw new Error("Atomic in-transaction verification count mismatch.");
      return { ok: true, atomic: true, verifiedInsideTransaction: true, stores: storeNames, written, verification };
    } finally { db.close(); }
  }

  async function bulkWriteAcrossStores(operationsByStore) {
    if (!operationsByStore || typeof operationsByStore !== "object" || Array.isArray(operationsByStore)) throw new Error("Cross-store merge requires an operations object.");
    const names = Object.keys(operationsByStore);
    if (!names.length) throw new Error("Cross-store merge contains no operations.");
    for (const name of names) {
      assertRecordStore(name); const group = operationsByStore[name];
      if (!group || !Array.isArray(group.add) || !Array.isArray(group.put)) throw new Error("Each store requires add and put arrays: " + name);
      const ids = new Set();
      for (const record of [...group.add, ...group.put]) { validateRecord(record); const id = String(record.id); if (ids.has(id)) throw new Error("Duplicate operation id in " + name + ": " + id); ids.add(id); }
    }
    const db = await openDatabase();
    try {
      const tx = db.transaction(names, "readwrite"); const done = transactionDone(tx);
      for (const name of names) { const store = tx.objectStore(name); const group = operationsByStore[name]; for (const record of group.add) store.add(record); for (const record of group.put) store.put(record); }
      await done; const verification = {};
      for (const name of names) { verification[name] = []; for (const record of [...operationsByStore[name].add, ...operationsByStore[name].put]) { const saved = await getRecord(name, record.id); if (!saved || JSON.stringify(saved) !== JSON.stringify(record)) throw new Error("Cross-store merge verification failed for " + name + "/" + record.id); verification[name].push(record.id); } }
      return { ok: true, atomic: true, stores: names, added: names.reduce((n,k)=>n+operationsByStore[k].add.length,0), updated: names.reduce((n,k)=>n+operationsByStore[k].put.length,0), verification };
    } finally { db.close(); }
  }
  async function snapshotLegacyData() {
    const db = await openDatabase();
    const snapshots = [];
    const digest = value => {
      let hash = 2166136261;
      for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
    };
    try {
      for (const key of enumerateLegacyKeys()) {
        const raw = localStorage.getItem(key);
        if (raw === null) {
          snapshots.push({ legacyKey: key, present: false, byteLength: 0, validJson: null });
          continue;
        }
        let validJson = true;
        try { JSON.parse(raw); } catch (_) { validJson = false; }
        const byteLength = new Blob([raw]).size;
        const baseId = "snapshot:" + digest(key) + ":" + digest(raw) + ":" + byteLength;
        const record = {
          id: baseId,
          legacyKey: key,
          present: true,
          raw,
          byteLength,
          validJson,
          capturedAt: new Date().toISOString(),
          snapshotPolicy: "append-only-content-addressed-v1"
        };
        // Never replace an earlier snapshot. Reuse an exact match; if a
        // digest collision is detected, use a distinct timestamped ID.
        let candidateId = baseId;
        let existing = await requestResult(db.transaction(["legacySnapshots"], "readonly")
          .objectStore("legacySnapshots").get(candidateId));
        if (existing && (existing.legacyKey !== key || existing.raw !== raw)) {
          candidateId = baseId + ":" + Date.now().toString(36);
          existing = await requestResult(db.transaction(["legacySnapshots"], "readonly")
            .objectStore("legacySnapshots").get(candidateId));
          if (existing && (existing.legacyKey !== key || existing.raw !== raw)) {
            throw new Error("Snapshot ID collision; existing snapshots were preserved for " + key);
          }
        }
        if (!existing) {
          record.id = candidateId;
          const tx = db.transaction(["legacySnapshots"], "readwrite");
          tx.objectStore("legacySnapshots").add(record);
          await transactionDone(tx);
        }
        const readTx = db.transaction(["legacySnapshots"], "readonly");
        const stored = await requestResult(readTx.objectStore("legacySnapshots").get(candidateId));
        if (!stored || stored.legacyKey !== key || stored.raw !== raw) {
          throw new Error("Snapshot verification failed for " + key);
        }
        snapshots.push({ legacyKey: key, present: true, byteLength, validJson,
          snapshotId: candidateId, reusedExisting: !!existing });
      }
      return { ok: true, database: DB_NAME, schemaVersion: DB_VERSION,
        scope: "all same-origin LocalStorage keys", appendOnly: true, snapshots };
    } finally { db.close(); }
  }

  async function migrateLegacyData() {
    const snapshot = await snapshotLegacyData();
    const migrated = [];
    const alreadyMatched = [];
    const conflicts = [];
    const invalid = [];
    for (const item of snapshot.snapshots) {
      if (!item.present) continue;
      const raw = localStorage.getItem(item.legacyKey);
      if (raw === null) throw new Error("Legacy value changed during migration: " + item.legacyKey);
      // KV is a raw-string archival layer, so valid JSON and plain-string
      // values are both eligible. JSON validity is retained as metadata only.
      // Never overwrite an existing IndexedDB value during migration. A mismatch
      // is a recovery conflict and must be resolved explicitly, not guessed.
      const existing = await get(item.legacyKey);
      if (existing !== null) {
        if (existing === raw) {
          alreadyMatched.push({ key: item.legacyKey, byteLength: item.byteLength });
          continue;
        }
        conflicts.push({ key: item.legacyKey, legacyBytes: item.byteLength,
          indexedDbBytes: new Blob([existing]).size });
        continue;
      }
      await set(item.legacyKey, raw);
      const copied = await get(item.legacyKey);
      if (copied !== raw) throw new Error("Migration verification failed for " + item.legacyKey);
      migrated.push({ key: item.legacyKey, byteLength: item.byteLength, validJson: item.validJson });
    }
    return { ok: conflicts.length === 0, nonDestructive: true,
      rawStringArchive: true, migratedCount: migrated.length, migrated, alreadyMatched, conflicts, invalid };
  }

  async function verifyMigration() {
    const results = [];
    for (const key of enumerateLegacyKeys()) {
      const source = localStorage.getItem(key);
      if (source === null) continue;
      const target = await get(key);
      results.push({ key, matches: target === source, sourceBytes: new Blob([source]).size,
        indexedDbBytes: target === null ? 0 : new Blob([target]).size });
    }
    return { ok: results.every(x => x.matches), checked: results.length,
      mismatches: results.filter(x => !x.matches), results };
  }


  async function selfTest() {
    const suffix = Date.now() + ":" + Math.random().toString(36).slice(2);
    const testKey = "__tha_idb_self_test__:" + suffix;
    const testValue = JSON.stringify({ marker: "THA-IDB-SELF-TEST", createdAt: new Date().toISOString(), payload: "read-write-verify-delete" });
    const recordId = "__tha_idb_self_test__:" + suffix;
    let writeVerified = false, readVerified = false, listed = false, deleteVerified = false;
    let typedPutVerified = false, typedReadVerified = false, typedListVerified = false, typedDeleteVerified = false;
    let blobRoundTripVerified = false;
    let kvSaved = false, recordSaved = false;
    try {
      await set(testKey, testValue);
      kvSaved = true;
      writeVerified = true;
      readVerified = (await get(testKey)) === testValue;
      listed = (await keys()).includes(testKey);
      if (!readVerified || !listed) throw new Error("IndexedDB key/value read/list verification failed");

      const blobFixture = new Blob(["THA-IDB-BLOB-SELF-TEST"], { type: "text/plain" });
      const fixture = { id: recordId, marker: "THA-IDB-RECORD-SELF-TEST", nested: { amount: 300 }, attachment: blobFixture, createdAt: new Date().toISOString() };
      await putRecord("projectMetadata", fixture);
      recordSaved = true;
      typedPutVerified = true;
      const loaded = await getRecord("projectMetadata", recordId);
      typedReadVerified = !!loaded && loaded.marker === fixture.marker &&
        JSON.stringify(loaded.nested) === JSON.stringify(fixture.nested) &&
        loaded.attachment instanceof Blob && loaded.attachment.type === blobFixture.type;
      if (typedReadVerified) {
        const restoredText = await loaded.attachment.text();
        blobRoundTripVerified = restoredText === "THA-IDB-BLOB-SELF-TEST";
      }
      const all = await getAllRecords("projectMetadata");
      typedListVerified = all.some(item => item.id === recordId) && (await countRecords("projectMetadata")) >= 1;
      if (!typedReadVerified || !typedListVerified || !blobRoundTripVerified) throw new Error("Typed IndexedDB record/Blob read-back verification failed");

      await deleteRecord("projectMetadata", recordId);
      recordSaved = false;
      typedDeleteVerified = (await getRecord("projectMetadata", recordId)) === null;

      await remove(testKey);
      kvSaved = false;
      deleteVerified = (await get(testKey)) === null && !(await keys()).includes(testKey);
      if (!typedDeleteVerified || !deleteVerified) throw new Error("IndexedDB delete verification failed");

      const checks = { writeVerified, readVerified, listed, deleteVerified, typedPutVerified, typedReadVerified, blobRoundTripVerified, typedListVerified, typedDeleteVerified };
      return { ok: Object.values(checks).every(Boolean), database: DB_NAME, schemaVersion: DB_VERSION,
        checks, legacyDataChanged: false, operationalDataChanged: false };
    } catch (error) {
      if (recordSaved) { try { await deleteRecord("projectMetadata", recordId); } catch (_) {} }
      if (kvSaved) { try { await remove(testKey); } catch (_) {} }
      const checks = { writeVerified, readVerified, listed, deleteVerified, typedPutVerified, typedReadVerified, typedListVerified, typedDeleteVerified };
      return { ok: false, database: DB_NAME, schemaVersion: DB_VERSION,
        checks, legacyDataChanged: false, operationalDataChanged: false,
        error: String(error && error.message || error) };
    }
  }


  async function inspectStorageInventory() {
    const localKeys = [];
    const groups = {
      accounting: /accounting|invoice_sequence|empty_invoice_sequence|sequence_cleanup/i,
      projects: /projects_v1/i,
      contracts: /contracts_v1/i,
      language: /language/i,
      reports: /report_|report_archive|report_settings|report_workflow/i,
      diagnostics: /monitor_log|isolation_test/i,
      recovery: /factory_reset|help_contact/i
    };
    // Inventory every key on this app origin, including report/help keys that
    // intentionally do not use the main THA prefix. Values are never returned.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const raw = localStorage.getItem(key);
      let jsonValid = true, parsedType = "string";
      try {
        const parsed = JSON.parse(raw);
        parsedType = parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed;
      } catch (_) { jsonValid = false; }
      const group = Object.entries(groups).find(([, re]) => re.test(key));
      localKeys.push({ key, bytes: new Blob([raw]).size, jsonValid, parsedType, domain: group ? group[0] : "unclassified" });
    }
    localKeys.sort((a,b) => a.key.localeCompare(b.key));
    const db = await openDatabase();
    try {
      const readAll = async name => {
        const tx = db.transaction([name], "readonly");
        return await requestResult(tx.objectStore(name).getAll());
      };
      const readCount = async name => {
        const tx = db.transaction([name], "readonly");
        return await requestResult(tx.objectStore(name).count());
      };
      const names = [...STORES, KV_STORE];
      const counts = {};
      for (const name of names) counts[name] = await readCount(name);
      const kvRows = await readAll(KV_STORE);
      const kv = kvRows.map(row => ({ key: row.key, bytes: new Blob([String(row.value ?? "")]).size, present: true }));
      const typed = {};
      for (const name of STORES) {
        const rows = await readAll(name);
        typed[name] = rows.map(row => ({ id: String(row.id), fields: Object.keys(row).sort(), migrationSource: row.migrationSource || row.snapshotKind || null }));
      }
      return {
        ok: true, readOnly: true, willWrite: false, localStorageChanged: false, indexedDBChanged: false,
        database: DB_NAME, schemaVersion: DB_VERSION,
        localStorage: { scope: "all same-origin keys", prefix: PREFIX, keyCount: localKeys.length, totalBytes: localKeys.reduce((n,x)=>n+x.bytes,0), keys: localKeys },
        indexedDB: { counts, kv, typedRecords: typed },
        note: "Metadata-only inventory. Record values, private notes, contact details and raw payloads are not exposed."
      };
    } finally { db.close(); }
  }

  async function inspectMigrationSources() {
    const byteLength = value => new Blob([String(value ?? "")]).size;
    const digest = value => {
      const text = String(value ?? "");
      let hash = 2166136261;
      for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
      return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
    };
    const safeJson = raw => { try { return { valid: true, value: JSON.parse(raw) }; } catch (_) { return { valid: false, value: null }; } };
    const summarizeTree = value => {
      const root = Array.isArray(value) ? value : (value && typeof value === "object" ? value : {});
      const findArray = (obj, names) => {
        for (const name of names) if (Array.isArray(obj && obj[name])) return obj[name];
        return [];
      };
      const projects = findArray(root, ["projects","projectList"]);
      const subprojects = [];
      const projectRows = projects.map(project => {
        const children = findArray(project, ["subProjects","subprojects","sub_projects","jobs"]);
        children.forEach(child => subprojects.push({ id: (child ? (child.id ?? child._id) : null), parentId: (project ? (project.id ?? project._id) : null) }));
        return { id: (project ? (project.id ?? project._id) : null), subprojectCount: children.length,
          subprojectIds: children.map(child => (child ? (child.id ?? child._id) : null)) };
      });
      const counts = {};
      for (const name of ["workers","partners","contractors","companies","companyJobs","company_jobs"]) counts[name] = findArray(root,[name]).length;
      const photos = [];
      const scan = (node, path, depth) => {
        if (!node || typeof node !== "object" || depth > 8) return;
        if (Array.isArray(node)) { node.forEach((v,i)=>scan(v,path+"["+i+"]",depth+1)); return; }
        for (const [key,val] of Object.entries(node)) {
          if (typeof val === "string" && /(photo|image|base64|dataurl)/i.test(key)) photos.push({ field:key, bytes:byteLength(val) });
          else if (val && typeof val === "object") scan(val,path+"."+key,depth+1);
        }
      };
      scan(root,"root",0);
      return { projectCount:projects.length, projectRows, totalSubprojects:subprojects.length, relatedCounts:counts,
        photoLikeFields:photos.length, photoLikeBytes:photos.reduce((n,x)=>n+x.bytes,0) };
    };
    const local = {};
    // Source comparison must use the same all-origin scope as inventory,
    // snapshots, migration and verification. Values remain internal to this
    // diagnostic and are never returned in its report.
    for (let i=0;i<localStorage.length;i++) {
      const key=localStorage.key(i);
      if (key) local[key]=localStorage.getItem(key);
    }
    const db=await openDatabase();
    try {
      const readAll = async name => {
        const tx=db.transaction([name],"readonly");
        const done=transactionDone(tx);
        const rows=await requestResult(tx.objectStore(name).getAll());
        await done; return rows;
      };
      const readKv = async key => {
        const tx=db.transaction([KV_STORE],"readonly");
        const done=transactionDone(tx);
        const row=await requestResult(tx.objectStore(KV_STORE).get(key));
        await done; return row ? String(row.value ?? "") : null;
      };
      const [typedProjects,typedContracts,settings,snapshots,kvProjects]=await Promise.all([
        readAll("projects"),readAll("contracts"),readAll("accountingSettings"),readAll("legacySnapshots"),
        readKv("__tha_idb_projects_migration_v1__")
      ]);
      const parsedPackage=kvProjects===null?null:safeJson(kvProjects);
      const packageValue=parsedPackage&&parsedPackage.valid?parsedPackage.value:null;
      const packageSummary=packageValue===null?null:summarizeTree(packageValue);
      const typedProjectRows=typedProjects.map(p=>({id:String(p.id),subprojectIds:(Array.isArray(p.subProjects)?p.subProjects:Array.isArray(p.subprojects)?p.subprojects:[]).map(x=>String(x&&x.id!==undefined?x.id:"")).filter(Boolean)}));
      const packageProjects=packageSummary&&packageValue?((Array.isArray(packageValue)?packageValue:packageValue.projects)||[]):[];
      const packageProject=packageProjects.find(x=>String(x&& (x.id??x._id))===String(typedProjects[0]&&typedProjects[0].id))||packageProjects[0]||null;
      const typedProject=typedProjects[0]||null;
      const packageSubs=packageProject?(Array.isArray(packageProject.subprojects)?packageProject.subprojects:Array.isArray(packageProject.subProjects)?packageProject.subProjects:[]):[];
      const typedSubs=typedProject?(Array.isArray(typedProject.subprojects)?typedProject.subprojects:Array.isArray(typedProject.subProjects)?typedProject.subProjects:[]):[];
      const typedSubIds=new Set(typedSubs.map(x=>String(x&&x.id)));
      const packageSubIds=new Set(packageSubs.map(x=>String(x&&x.id)));
      const extraSubprojects=packageSubs.filter(x=>!typedSubIds.has(String(x&&x.id))).map(x=>({id:String(x&&x.id),fieldNames:Object.keys(x||{}).sort(),hasIncome:Array.isArray(x&&x.income),incomeCount:Array.isArray(x&&x.income)?x.income.length:0}));
      const packageRootFields=packageValue&&typeof packageValue==="object"?Object.keys(packageValue).sort():[];
      const numericSummary = rows => {
        const list=Array.isArray(rows)?rows:[];
        let amountTotal=0,amountCount=0;
        for(const row of list){const n=Number(row&&row.amount);if(Number.isFinite(n)){amountTotal+=n;amountCount++;}}
        return {count:list.length,ids:list.map(x=>x&&x.id!==undefined?String(x.id):null),amountFieldCount:amountCount,amountTotal};
      };
      const extraSubprojectAudit=extraSubprojects.map(item=>{
        const row=packageSubs.find(x=>String(x&&x.id)===item.id)||{};
        return {id:item.id,fieldNames:Object.keys(row).sort(),price:row.price??null,
          income:numericSummary(row.income),expenses:numericSummary(row.expenses),materials:numericSummary(row.materials),
          tools:numericSummary(row.tools),food:numericSummary(row.food),wages:numericSummary(row.wages),
          photoPresent:!!row.photo,photoBytes:typeof row.photo==="string"?byteLength(row.photo):0};
      });
      const projectFieldComparison={packageRootFields,packageProjectFields:Object.keys(packageProject||{}).sort(),typedProjectFields:Object.keys(typedProject||{}).sort(),
        packageSubprojectCount:packageSubs.length,typedSubprojectCount:typedSubs.length,subprojectIdsOnlyInPackage:[...packageSubIds].filter(x=>!typedSubIds.has(x)),
        subprojectIdsOnlyInTyped:[...typedSubIds].filter(x=>!packageSubIds.has(x)),packageOnlySubprojectDetails:extraSubprojects,extraSubprojectAudit};
      const canonical=value=>{if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";return JSON.stringify(value);};
      const settingsEquality=settings.length<2?null:canonical(settings[0].value)===canonical(settings[1].value);
      const settingsValueAudit=settings.map(row=>{
        const value=row&&row.value&&typeof row.value==="object"?row.value:{};
        return {id:String(row.id),fields:Object.keys(value).sort(),
          fieldSummaries:Object.fromEntries(Object.entries(value).map(([key,val])=>[key,{
            type:val===null?"null":Array.isArray(val)?"array":typeof val,
            present:val!==undefined&&val!==null&&String(val)!=="",
            bytes:typeof val==="string"?byteLength(val):byteLength(canonical(val)),
            digest:digest(canonical(val))
          }]))};
      });
      const contractAudit=typedContracts.map(row=>({id:String(row.id),fields:Object.keys(row).sort(),
        nestedFields:Object.fromEntries(Object.entries(row).filter(([,v])=>v&&typeof v==="object"&&!Array.isArray(v)).map(([k,v])=>[k,Object.keys(v).sort()]))}));


      const typedProjectIds=new Set(typedProjectRows.map(x=>x.id));
      const packageProjectIds=new Set(packageSummary?packageSummary.projectRows.map(x=>x.id).filter(x=>x!==null).map(String):[]);
      const projectComparison={package:packageSummary,typed:{projectCount:typedProjects.length,projectRows:typedProjectRows},
        projectIdsOnlyInPackage:[...packageProjectIds].filter(x=>!typedProjectIds.has(x)),
        projectIdsOnlyInTyped:[...typedProjectIds].filter(x=>!packageProjectIds.has(x))};
      const snapshotSummary={};
      for(const key of Object.keys(local)){
        const current=local[key], rows=snapshots.filter(x=>x.legacyKey===key && x.present && typeof x.raw==="string");
        snapshotSummary[key]={currentBytes:byteLength(current),currentDigest:digest(current),
          snapshots:rows.map(x=>({id:x.id,capturedAt:x.capturedAt||null,bytes:byteLength(x.raw),digest:digest(x.raw),matchesCurrent:x.raw===current})),
          matchingSnapshotCount:rows.filter(x=>x.raw===current).length};
      }
      const kvComparison={};
      for(const key of Object.keys(local)){
        const stored=await readKv(key), current=local[key];
        kvComparison[key]={localBytes:byteLength(current),kvPresent:stored!==null,kvBytes:stored===null?0:byteLength(stored),
          exactMatch:stored===null?null:stored===current,localDigest:digest(current),kvDigest:stored===null?null:digest(stored)};
      }
      const settingsSummary=settings.map(row=>({id:String(row.id),fields:Object.keys(row).sort(),
        nestedFields:Object.fromEntries(Object.entries(row).filter(([,v])=>v&&typeof v==="object"&&!Array.isArray(v)).map(([k,v])=>[k,Object.keys(v).sort()]))}));
      const contractsLocal=local[PREFIX+"contracts_v1"]??null;
      const projectsLocal=local[PREFIX+"projects_v1"]??null;
      const safeLocalSummary=raw=>raw===null?{present:false}:({present:true,bytes:byteLength(raw),digest:digest(raw),jsonValid:safeJson(raw).valid});
      const localStorageKeys=Object.keys(local).sort();
      const localStorageDomainKeys={
        accounting:localStorageKeys.filter(k=>/accounting|invoice_sequence|sequence_cleanup/i.test(k)),
        projects:localStorageKeys.filter(k=>/project|workspace/i.test(k)),
        contracts:localStorageKeys.filter(k=>/contract/i.test(k)),
        diagnostics:localStorageKeys.filter(k=>/monitor|diagnostic|audit/i.test(k)),
        reports:localStorageKeys.filter(k=>/report/i.test(k)),
        language:localStorageKeys.filter(k=>/language/i.test(k)),
        recovery:localStorageKeys.filter(k=>/recovery|restore|baseline|factory_reset/i.test(k))
      };
      const sourceCandidates = [];
      const mediaCandidates = [];
      const scanMedia = (node, sourceKey, path, depth) => {
        if (!node || typeof node !== "object" || depth > 10) return;
        if (typeof Blob !== "undefined" && node instanceof Blob) {
          mediaCandidates.push({ source:sourceKey, path:path||"(blob)", field:"Blob", bytes:node.size, mimeType:node.type||"", dataUrl:false, binary:true });
          return;
        }
        if (ArrayBuffer.isView(node)) {
          mediaCandidates.push({ source:sourceKey, path:path||"(binary-view)", field:node.constructor&&node.constructor.name||"BinaryView", bytes:node.byteLength, dataUrl:false, binary:true });
          return;
        }
        if (Array.isArray(node)) { node.forEach((value,index)=>scanMedia(value,sourceKey,path+"["+index+"]",depth+1)); return; }
        for (const [field,value] of Object.entries(node)) {
          const nextPath = path ? path+"."+field : field;
          if (typeof value === "string" && /(logo|photo|image|receipt|attachment|signature|document|file|report)/i.test(field)) {
            const isDataUrl = /^data:[^;,]+(?:;[^,]*)?,/i.test(value);
            mediaCandidates.push({ source:sourceKey, path:nextPath, field, bytes:byteLength(value), dataUrl:isDataUrl, looksLikeBase64:!isDataUrl && value.length>256 && /^[A-Za-z0-9+/=\\s]+$/.test(value.slice(0,512)) });
          } else if (value && typeof value === "object") scanMedia(value,sourceKey,nextPath,depth+1);
        }
      };
      for (const [key,raw] of Object.entries(local)) {
        if (!/(project|contract|account|invoice|receipt|logo|image|photo|report|asset)/i.test(key)) continue;
        const parsed = safeJson(raw);
        const value = parsed.valid ? parsed.value : null;
        let summary = null;
        if (value !== null) {
          summary = summarizeTree(value);
          const root = Array.isArray(value) ? value : (value && typeof value === "object" ? value : {});
          const arrayCounts = {};
          for (const name of ["projects","projectList","contracts","invoices","entries","customers","receipts","expenses","reports","workers","partners","contractors","companies","companyJobs"]) {
            if (Array.isArray(root[name])) arrayCounts[name] = root[name].length;
          }
          summary = { ...summary, topLevelArrayCounts:arrayCounts, topLevelFields:Object.keys(root).sort() };
          scanMedia(value,key,"",0);
        }
        sourceCandidates.push({ key, bytes:byteLength(raw), digest:digest(raw), jsonValid:parsed.valid,
          parsedType:parsed.valid ? (Array.isArray(value)?"array":value===null?"null":typeof value) : "string", summary });
      }
      const indexedMediaBefore = mediaCandidates.length;
      for (const storeName of STORES) {
        const rows = await readAll(storeName);
        rows.forEach((row,index)=>scanMedia(row,"indexedDB:"+storeName,"record["+index+"]",0));
      }
      const indexedMedia = mediaCandidates.slice(indexedMediaBefore);
      const mediaBySource = {};
      for (const item of mediaCandidates) {
        const key = item.source;
        if (!mediaBySource[key]) mediaBySource[key] = { fields:0, bytes:0, dataUrls:0 };
        mediaBySource[key].fields++;
        mediaBySource[key].bytes += item.bytes;
        if (item.dataUrl) mediaBySource[key].dataUrls++;
      }
      const deepSourceAudit = {
        build:"deep-source-audit-v1",
        candidateCount:sourceCandidates.length,
        sourceCandidates,
        mediaInventory:{ fieldCount:mediaCandidates.length, indexedDBFieldCount:indexedMedia.length,
          bySource:mediaBySource, fields:mediaCandidates },
        safety:"Metadata only. No raw values, image data, file contents, contact details or free-text payloads are returned."
      };
      const kvRows=await readAll(KV_STORE);
      const snapshotCounts={total:snapshots.length,present:snapshots.filter(x=>x.present).length,
        byLegacyKey:Object.fromEntries([...new Set(snapshots.map(x=>x.legacyKey))].sort().map(key=>[key,snapshots.filter(x=>x.legacyKey===key).length]))};
      return {ok:true,readOnly:true,willWrite:false,localStorageChanged:false,indexedDBChanged:false,
        diagnosticBuild:"all-origin-source-compare-v2",
        database:DB_NAME,schemaVersion:DB_VERSION,
        localStorageAudit:{keyCount:localStorageKeys.length,keys:localStorageKeys,domainKeys:localStorageDomainKeys},
        indexedDBAudit:{kvCount:kvRows.length,kvKeys:kvRows.map(x=>x.key).sort(),snapshotCounts},
        localStorageSources:{projects:safeLocalSummary(projectsLocal),contracts:safeLocalSummary(contractsLocal),
          monitorLog:safeLocalSummary(local[PREFIX+"monitor_log_v1"]??null)},
        deepSourceAudit,
        projects:projectComparison,projectFieldComparison,
        projectsPackage:{present:kvProjects!==null,bytes:kvProjects===null?0:byteLength(kvProjects),digest:kvProjects===null?null:digest(kvProjects),
          jsonValid:parsedPackage?parsedPackage.valid:null,summary:packageSummary},
        contracts:{typedCount:typedContracts.length,typedIds:typedContracts.map(x=>String(x.id)),typedAudit:contractAudit,
          localStoragePresent:contractsLocal!==null},
        monitorLog:{localStorage:safeLocalSummary(local[PREFIX+"monitor_log_v1"]??null),
          kv:kvComparison[PREFIX+"monitor_log_v1"]||null,snapshots:snapshotSummary[PREFIX+"monitor_log_v1"]||[]},
        kvComparison,snapshotComparison:snapshotSummary,accountingSettings:{records:settingsSummary,valuesEqual:settingsEquality,acceptedDifferences:true,reviewStatus:"accepted_by_user",conflictCount:0,valueAudit:settingsValueAudit},
        note:"Read-only structural comparison. Digests are non-cryptographic diagnostics; no raw values, names, addresses, contacts or private notes are returned."};
    } finally { db.close(); }
  }

  // Complete database-level backup. IndexedDB structured-clone values (including
  // Blob/File payloads) are retained; no JSON stringify/parse is used internally.
  async function exportCompleteBackup() {
    const db = await openDatabase();
    try {
      const names = [...STORES, KV_STORE];
      const tx = db.transaction(names, "readonly");
      const done = transactionDone(tx);
      const data = {};
      for (const name of names) {
        data[name] = await requestResult(tx.objectStore(name).getAll());
      }
      await done;
      const counts = Object.fromEntries(names.map(name => [name, data[name].length]));
      return {
        format: "the-handyman-indexeddb-backup",
        formatVersion: 1,
        database: DB_NAME,
        schemaVersion: DB_VERSION,
        exportedAt: new Date().toISOString(),
        stores: names,
        counts,
        data
      };
    } finally { db.close(); }
  }

  // Replace every store in one read/write transaction. Invalid packages are
  // rejected before any mutation; transaction failure rolls the replacement back.
  // Restore the portable export format produced by exportPortableBackup().
  // The IndexedDB replacement is one transaction. LocalStorage is then replaced
  // with an in-memory rollback snapshot; if either phase fails, both stores are
  // restored to their pre-restore state as far as the browser permits.
  async function restorePortableBackup(packageValue) {
    if (!packageValue || typeof packageValue !== "object" ||
        packageValue.format !== "the-handyman-portable-complete-backup" ||
        packageValue.formatVersion !== 1 ||
        packageValue.app !== "The Handyman Accountancy") {
      throw new Error("Unsupported or invalid portable backup package.");
    }
    if (!packageValue.source || packageValue.source.database !== DB_NAME ||
        packageValue.source.schemaVersion !== DB_VERSION) {
      throw new Error("Backup database or schema version does not match this application.");
    }
    const names = [...STORES, KV_STORE];
    const idb = packageValue.indexedDB;
    if (!idb || idb.database !== DB_NAME || idb.schemaVersion !== DB_VERSION ||
        !Array.isArray(idb.stores) || names.length !== idb.stores.length ||
        names.some(name => !idb.stores.includes(name)) ||
        !idb.data || typeof idb.data !== "object") {
      throw new Error("Backup IndexedDB manifest does not match this application.");
    }
    const prefixes = ["handyman_", "tha_test226_", "tha_restore_test_v1_", "tha_v206_"];
    const localRecords = packageValue.localStorage && packageValue.localStorage.records;
    if (!packageValue.localStorage || !Array.isArray(localRecords) ||
        packageValue.localStorage.count !== localRecords.length) {
      throw new Error("Backup LocalStorage section is missing or has an invalid count.");
    }
    const localSeen = new Set();
    for (const item of localRecords) {
      if (!item || typeof item.key !== "string" ||
          !prefixes.some(prefix => item.key.startsWith(prefix)) ||
          typeof item.present !== "boolean" ||
          (item.present && typeof item.value !== "string") ||
          (!item.present && item.value !== null) ||
          localSeen.has(item.key)) {
        throw new Error("Invalid or duplicate LocalStorage backup record.");
      }
      localSeen.add(item.key);
    }

    const decodeBase64 = value => {
      const binary = atob(value || "");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    };
    const typedConstructors = {
      Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
      Int32Array, Uint32Array, Float32Array, Float64Array
    };
    if (typeof BigInt64Array !== "undefined") typedConstructors.BigInt64Array = BigInt64Array;
    if (typeof BigUint64Array !== "undefined") typedConstructors.BigUint64Array = BigUint64Array;
    const decode = value => {
      if (value === null || typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map(decode);
      if (value.__thaType === "Undefined") return undefined;
      if (value.__thaType === "Date") {
        const date = new Date(value.value);
        if (Number.isNaN(date.getTime())) throw new Error("Invalid Date value in backup.");
        return date;
      }
      if (value.__thaType === "ArrayBuffer") return decodeBase64(value.base64).buffer;
      if (value.__thaType === "TypedArray") {
        const bytes = decodeBase64(value.base64);
        if (value.constructor === "DataView") return new DataView(bytes.buffer);
        const Constructor = typedConstructors[value.constructor];
        if (!Constructor || bytes.byteLength % Constructor.BYTES_PER_ELEMENT !== 0) {
          throw new Error("Unsupported or invalid typed array in backup.");
        }
        return new Constructor(bytes.buffer);
      }
      if (value.__thaType === "Blob" || value.__thaType === "File") {
        const blob = new Blob([decodeBase64(value.base64)], { type: value.mimeType || "" });
        if (value.size !== blob.size) throw new Error("Binary media size verification failed during backup decoding.");
        if (value.__thaType === "File") {
          if (typeof File === "undefined") return blob;
          return new File([blob], value.name || "restored-file", {
            type: value.mimeType || "", lastModified: Number(value.lastModified) || 0
          });
        }
        return blob;
      }
      const out = {};
      for (const key of Object.keys(value)) out[key] = decode(value[key]);
      return out;
    };

    const restoredRows = {};
    for (const name of names) {
      const encoded = idb.data[name];
      if (!Array.isArray(encoded)) throw new Error("Backup is missing IndexedDB store: " + name);
      const expectedCount = idb.counts && idb.counts[name];
      if (!Number.isInteger(expectedCount) || expectedCount !== encoded.length) {
        throw new Error("IndexedDB backup count mismatch for store: " + name);
      }
      restoredRows[name] = decode(encoded);
      const seen = new Set();
      for (const row of restoredRows[name]) {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          throw new Error("Invalid record in IndexedDB store: " + name);
        }
        const key = name === KV_STORE ? row.key : row.id;
        if ((typeof key !== "string" && !(typeof key === "number" && Number.isFinite(key))) ||
            String(key).trim() === "") throw new Error("Invalid record key in IndexedDB store: " + name);
        const normalized = typeof key + ":" + String(key);
        if (seen.has(normalized)) throw new Error("Duplicate record key in IndexedDB store: " + name);
        seen.add(normalized);
      }
    }

    const db = await openDatabase();
    let oldRows = {};
    let oldLocal = [];
    let localCommitStarted = false;
    let idbCommitStarted = false;
    try {
      const readTx = db.transaction(names, "readonly");
      const readDone = transactionDone(readTx);
      for (const name of names) oldRows[name] = await requestResult(readTx.objectStore(name).getAll());
      await readDone;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && prefixes.some(prefix => key.startsWith(prefix))) {
          oldLocal.push({ key, value: localStorage.getItem(key) });
        }
      }

      const writeTx = db.transaction(names, "readwrite");
      const writeDone = transactionDone(writeTx);
      idbCommitStarted = true;
      for (const name of names) {
        const store = writeTx.objectStore(name);
        store.clear();
        for (const row of restoredRows[name]) store.put(row);
      }
      await writeDone;

      localCommitStarted = true;
      for (const item of oldLocal) localStorage.removeItem(item.key);
      for (const item of localRecords) {
        if (item.present) localStorage.setItem(item.key, item.value);
      }

      const sameValue = async (a, b) => {
        if (a === b) return true;
        if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
        if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
        if (a instanceof Blob || b instanceof Blob) {
          if (!(a instanceof Blob) || !(b instanceof Blob) || a.size !== b.size || a.type !== b.type) return false;
          if (typeof File !== "undefined" && (a instanceof File || b instanceof File)) {
            if (!(a instanceof File) || !(b instanceof File) || a.name !== b.name || a.lastModified !== b.lastModified) return false;
          }
          const [ab, bb] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
          const av = new Uint8Array(ab), bv = new Uint8Array(bb);
          return av.length === bv.length && av.every((byte, index) => byte === bv[index]);
        }
        if (a instanceof ArrayBuffer || b instanceof ArrayBuffer || ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
          const av = a instanceof ArrayBuffer ? new Uint8Array(a) : ArrayBuffer.isView(a) ? new Uint8Array(a.buffer, a.byteOffset, a.byteLength) : null;
          const bv = b instanceof ArrayBuffer ? new Uint8Array(b) : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : null;
          return !!av && !!bv && a.constructor === b.constructor && av.length === bv.length && av.every((byte, index) => byte === bv[index]);
        }
        if (Array.isArray(a) || Array.isArray(b)) {
          if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
          for (let i = 0; i < a.length; i++) if (!await sameValue(a[i], b[i])) return false;
          return true;
        }
        const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
        if (ak.length !== bk.length || ak.some((key, index) => key !== bk[index])) return false;
        for (const key of ak) if (!await sameValue(a[key], b[key])) return false;
        return true;
      };
      const verifyTx = db.transaction(names, "readonly");
      const verifyDone = transactionDone(verifyTx);
      const verifyRequests = names.map(name => requestResult(verifyTx.objectStore(name).getAll()));
      const verifiedRows = await Promise.all(verifyRequests);
      await verifyDone;
      const verifiedCounts = {};
      for (let storeIndex = 0; storeIndex < names.length; storeIndex++) {
        const name = names[storeIndex], rows = verifiedRows[storeIndex];
        if (rows.length !== restoredRows[name].length) {
          throw new Error("Post-restore IndexedDB count verification failed for store: " + name);
        }
        for (let index = 0; index < rows.length; index++) {
          if (!await sameValue(rows[index], restoredRows[name][index])) {
            throw new Error("Post-restore IndexedDB content verification failed for store: " + name);
          }
        }
        verifiedCounts[name] = rows.length;
      }
      for (const item of localRecords) {
        const actual = localStorage.getItem(item.key);
        if (item.present ? actual !== item.value : actual !== null) {
          throw new Error("Post-restore LocalStorage verification failed for key: " + item.key);
        }
      }
      return {
        ok: true, format: packageValue.format, database: DB_NAME,
        schemaVersion: DB_VERSION, localStorageRecords: localRecords.length,
        indexedDBCounts: verifiedCounts, rollbackAvailableDuringRestore: true
      };
    } catch (error) {
      let rollbackErrors = [];
      if (localCommitStarted) {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && prefixes.some(prefix => key.startsWith(prefix))) localStorage.removeItem(key);
          }
          for (const item of oldLocal) localStorage.setItem(item.key, item.value);
          for (const item of oldLocal) {
            if (localStorage.getItem(item.key) !== item.value) throw new Error("LocalStorage rollback verification failed.");
          }
        } catch (rollbackError) { rollbackErrors.push("LocalStorage rollback: " + rollbackError.message); }
      }
      if (idbCommitStarted) {
        try {
          const rollbackTx = db.transaction(names, "readwrite");
          const rollbackDone = transactionDone(rollbackTx);
          for (const name of names) {
            const store = rollbackTx.objectStore(name);
            store.clear();
            for (const row of oldRows[name]) store.put(row);
          }
          await rollbackDone;
          for (const name of names) {
            const checkTx = db.transaction([name], "readonly");
            const checkDone = transactionDone(checkTx);
            const count = await requestResult(checkTx.objectStore(name).count());
            await checkDone;
            if (count !== oldRows[name].length) throw new Error("IndexedDB rollback count verification failed for " + name);
          }
        } catch (rollbackError) { rollbackErrors.push("IndexedDB rollback: " + rollbackError.message); }
      }
      if (rollbackErrors.length) {
        throw new Error((error && error.message ? error.message : "Portable restore failed.") +
          " CRITICAL: rollback could not be fully verified. " + rollbackErrors.join("; "));
      }
      throw error;
    } finally { db.close(); }
  }

  async function restoreCompleteBackup(packageValue) {
    if (!packageValue || typeof packageValue !== "object" ||
        packageValue.format !== "the-handyman-indexeddb-backup" ||
        packageValue.formatVersion !== 1 ||
        !packageValue.data || typeof packageValue.data !== "object") {
      throw new Error("Unsupported or invalid IndexedDB backup package.");
    }
    const names = [...STORES, KV_STORE];
    if (!Array.isArray(packageValue.stores) ||
        names.length !== packageValue.stores.length ||
        names.some(name => !packageValue.stores.includes(name))) {
      throw new Error("Backup store manifest does not match this application database.");
    }
    for (const name of names) {
      const rows = packageValue.data[name];
      if (!Array.isArray(rows)) throw new Error("Backup is missing a valid store: " + name);
      const seen = new Set();
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          throw new Error("Invalid record in backup store: " + name);
        }
        const key = name === KV_STORE ? row.key : row.id;
        if ((typeof key !== "string" && !(typeof key === "number" && Number.isFinite(key))) ||
            String(key).trim() === "") {
          throw new Error("Backup record has no valid key in store: " + name);
        }
        const normalized = typeof key + ":" + String(key);
        if (seen.has(normalized)) throw new Error("Duplicate key in backup store: " + name);
        seen.add(normalized);
      }
    }
    const db = await openDatabase();
    try {
      const tx = db.transaction(names, "readwrite");
      const done = transactionDone(tx);
      for (const name of names) {
        const store = tx.objectStore(name);
        store.clear();
        for (const row of packageValue.data[name]) store.put(row);
      }
      await done;
      const verification = {};
      for (const name of names) {
        const verifyTx = db.transaction([name], "readonly");
        const rows = await requestResult(verifyTx.objectStore(name).getAll());
        const expected = packageValue.data[name].length;
        if (rows.length !== expected) throw new Error("Restore count verification failed for store: " + name);
        verification[name] = { expected, actual: rows.length, ok: true };
      }
      return { ok: true, atomic: true, database: DB_NAME, schemaVersion: DB_VERSION, verification };
    } finally { db.close(); }
  }

  // IndexedDB-only clearing primitive. Deliberately does not touch LocalStorage
  // until the application has completed migration and can prove no live data
  // remains there. This is not exposed as the user-facing Factory Reset yet.
  async function clearIndexedDBData() {
    const names = [...STORES, KV_STORE];
    const db = await openDatabase();
    try {
      const tx = db.transaction(names, "readwrite");
      const done = transactionDone(tx);
      for (const name of names) tx.objectStore(name).clear();
      await done;
      const remaining = {};
      for (const name of names) {
        const verifyTx = db.transaction([name], "readonly");
        remaining[name] = await requestResult(verifyTx.objectStore(name).count());
        if (remaining[name] !== 0) throw new Error("IndexedDB clear verification failed for store: " + name);
      }
      return { ok: true, cleared: names, remaining };
    } finally { db.close(); }
  }

  // Whole-domain snapshots used during the controlled transition from
  // synchronous LocalStorage persistence to IndexedDB. Values use IndexedDB's
  // structured-clone algorithm, preserving nested objects, arrays, Blob and File.
  async function readAppState(domain) {
    const allowed = ["accounting", "projects", "contracts", "assets", "reports"];
    if (!allowed.includes(String(domain))) throw new Error("Unknown application state domain.");
    const record = await getRecord("appState", String(domain));
    return record ? record.value : null;
  }

  async function writeAppState(domain, value) {
    const allowed = ["accounting", "projects", "contracts", "assets", "reports"];
    if (!allowed.includes(String(domain))) throw new Error("Unknown application state domain.");
    if (value === undefined) throw new Error("Application state value cannot be undefined.");
    await putRecord("appState", { id: String(domain), value, updatedAt: new Date().toISOString() });
    const check = await getRecord("appState", String(domain));
    if (!check || !("value" in check)) throw new Error("Application state read-back verification failed.");
    return { ok: true, domain: String(domain), verified: true };
  }

  async function writeAppStatesAtomically(states) {
    if (!states || typeof states !== "object" || Array.isArray(states)) {
      throw new Error("Application state batch must be an object.");
    }
    const allowed = new Set(["accounting", "projects", "contracts", "assets", "reports"]);
    const entries = Object.entries(states);
    if (!entries.length || entries.some(([key, value]) => !allowed.has(key) || value === undefined)) {
      throw new Error("Application state batch contains an unsupported domain or undefined value.");
    }
    const db = await openDatabase();
    try {
      const tx = db.transaction(["appState"], "readwrite");
      const done = transactionDone(tx);
      const store = tx.objectStore("appState");
      for (const [id, value] of entries) {
        store.put({ id, value, updatedAt: new Date().toISOString() });
      }
      await done;
      const verifyTx = db.transaction(["appState"], "readonly");
      const verifyDone = transactionDone(verifyTx);
      const verifyStore = verifyTx.objectStore("appState");
      const verified = {};
      for (const [id] of entries) {
        const row = await requestResult(verifyStore.get(id));
        verified[id] = !!row && Object.prototype.hasOwnProperty.call(row, "value");
      }
      await verifyDone;
      if (Object.values(verified).some(ok => !ok)) {
        throw new Error("One or more application state domains failed verification.");
      }
      return { ok: true, atomic: true, verified };
    } finally { db.close(); }
  }

  // Lossless, non-destructive export of app-owned LocalStorage plus every
  // IndexedDB store. Binary values are encoded explicitly; no restore is performed.
  async function exportPortableBackup() {
    const appKeyPattern = /^(handyman_|tha_test226_|tha_restore_test_v1_|tha_v206_)/;
    const local = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && appKeyPattern.test(key)) {
        const value = localStorage.getItem(key);
        local.push({ key, present: value !== null, value });
      }
    }
    for (const key of LEGACY_KEYS) {
      if (!local.some(item => item.key === key)) local.push({ key, present: false, value: null });
    }
    local.sort((a, b) => a.key.localeCompare(b.key));

    const names = [...STORES, KV_STORE];
    const db = await openDatabase();
    let rawStores;
    try {
      const tx = db.transaction(names, "readonly");
      const done = transactionDone(tx);
      rawStores = {};
      for (const name of names) rawStores[name] = await requestResult(tx.objectStore(name).getAll());
      await done;
    } finally { db.close(); }

    const bytesToBase64 = bytes => {
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    };
    const encode = async value => {
      if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
      if (typeof value === "undefined") return { __thaType: "Undefined" };
      if (value instanceof Blob) {
        const buffer = await value.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        return {
          __thaType: typeof File !== "undefined" && value instanceof File ? "File" : "Blob",
          mimeType: value.type || "",
          size: value.size,
          name: typeof File !== "undefined" && value instanceof File ? value.name : undefined,
          lastModified: typeof File !== "undefined" && value instanceof File ? value.lastModified : undefined,
          base64: bytesToBase64(bytes)
        };
      }
      if (value instanceof ArrayBuffer) return { __thaType: "ArrayBuffer", base64: bytesToBase64(new Uint8Array(value)) };
      if (ArrayBuffer.isView(value)) {
        return { __thaType: "TypedArray", constructor: value.constructor.name,
          base64: bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
      }
      if (value instanceof Date) return { __thaType: "Date", value: value.toISOString() };
      if (Array.isArray(value)) return Promise.all(value.map(encode));
      if (typeof value === "object") {
        const out = {};
        for (const key of Object.keys(value)) out[key] = await encode(value[key]);
        return out;
      }
      throw new Error("Unsupported value type in IndexedDB backup: " + typeof value);
    };

    const encodedStores = {};
    for (const name of names) encodedStores[name] = await encode(rawStores[name]);
    const counts = Object.fromEntries(names.map(name => [name, rawStores[name].length]));
    const media = { blobCount: 0, binaryCount: 0, binaryBytes: 0 };
    const inspect = value => {
      if (!value || typeof value !== "object") return;
      if (value.__thaType === "Blob" || value.__thaType === "File") {
        media.blobCount++; media.binaryBytes += Number(value.size) || 0; return;
      }
      if (value.__thaType === "ArrayBuffer" || value.__thaType === "TypedArray") {
        media.binaryCount++;
        try { media.binaryBytes += atob(value.base64 || "").length; } catch (_) {}
        return;
      }
      if (Array.isArray(value)) value.forEach(inspect);
      else Object.values(value).forEach(inspect);
    };
    inspect(encodedStores);
    return {
      app: "The Handyman Accountancy",
      format: "the-handyman-portable-complete-backup",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      source: { database: DB_NAME, schemaVersion: DB_VERSION, localStorageScope: "app namespace prefixes only" },
      localStorage: { count: local.length, records: local },
      indexedDB: { database: DB_NAME, schemaVersion: DB_VERSION, stores: names, counts, data: encodedStores },
      media
    };
  }

  async function status() {
    const db = await openDatabase();
    try {
      const counts = {};
      for (const name of [...STORES, KV_STORE]) {
        const tx = db.transaction([name], "readonly");
        counts[name] = await requestResult(tx.objectStore(name).count());
      }
      return { ok: true, database: DB_NAME, schemaVersion: DB_VERSION, stores: counts };
    } finally { db.close(); }
  }

  window.HandymanStorageFoundation = Object.freeze({
    openDatabase, get, set, remove, keys,
    putRecord, getRecord, getAllRecords, countRecords, deleteRecord, bulkPutRecords, bulkAddAcrossStores, bulkAddAcrossStoresVerified, bulkWriteAcrossStores,
    snapshotLegacyData, migrateLegacyData, verifyMigration, selfTest, inspectStorageInventory, inspectMigrationSources, exportPortableBackup, restorePortableBackup, exportCompleteBackup, restoreCompleteBackup, clearIndexedDBData, readAppState, writeAppState, writeAppStatesAtomically, status,
    legacyKeys: LEGACY_KEYS.slice(),
    stores: [...STORES, KV_STORE], databaseName: DB_NAME, schemaVersion: DB_VERSION
  });
})();
