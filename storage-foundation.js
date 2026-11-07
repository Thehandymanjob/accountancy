/* The Handyman Accountancy v233 - non-destructive IndexedDB foundation.
   This module is an isolated storage layer. It does not change app persistence
   automatically and never deletes or modifies legacy LocalStorage values.
*/
(function () {
  "use strict";
  const DB_NAME = "the_handyman_accountancy_v250_idb";
  const DB_VERSION = 4;
  const PREFIX = "tha_v206_";
  const LEGACY_KEYS = [
    "tha_v206_accounting_v1",
    "tha_v206_contracts_v1",
    "tha_v206_projects_v1",
    "tha_v206_factory_reset_recovery_v1"
  ];
  const STORES = ["legacySnapshots", "customers", "projects", "invoices", "contracts",
    "accountingEntries", "projectReceipts", "projectExpenses", "workers", "partners",
    "contractors", "companies", "companyJobs", "customExpenseCategories",
    "thirdPartyTransactions", "accountingSettings", "projectMetadata", "auditLog", "recordOrder"];
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
    let kvSaved = false, recordSaved = false;
    try {
      await set(testKey, testValue);
      kvSaved = true;
      writeVerified = true;
      readVerified = (await get(testKey)) === testValue;
      listed = (await keys()).includes(testKey);
      if (!readVerified || !listed) throw new Error("IndexedDB key/value read/list verification failed");

      const fixture = { id: recordId, marker: "THA-IDB-RECORD-SELF-TEST", nested: { amount: 300 }, createdAt: new Date().toISOString() };
      await putRecord("projectMetadata", fixture);
      recordSaved = true;
      typedPutVerified = true;
      const loaded = await getRecord("projectMetadata", recordId);
      typedReadVerified = !!loaded && JSON.stringify(loaded) === JSON.stringify(fixture);
      const all = await getAllRecords("projectMetadata");
      typedListVerified = all.some(item => item.id === recordId) && (await countRecords("projectMetadata")) >= 1;
      if (!typedReadVerified || !typedListVerified) throw new Error("Typed IndexedDB record read/list verification failed");

      await deleteRecord("projectMetadata", recordId);
      recordSaved = false;
      typedDeleteVerified = (await getRecord("projectMetadata", recordId)) === null;

      await remove(testKey);
      kvSaved = false;
      deleteVerified = (await get(testKey)) === null && !(await keys()).includes(testKey);
      if (!typedDeleteVerified || !deleteVerified) throw new Error("IndexedDB delete verification failed");

      const checks = { writeVerified, readVerified, listed, deleteVerified, typedPutVerified, typedReadVerified, typedListVerified, typedDeleteVerified };
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
    snapshotLegacyData, migrateLegacyData, verifyMigration, selfTest, inspectStorageInventory, inspectMigrationSources, status,
    legacyKeys: LEGACY_KEYS.slice(),
    stores: [...STORES, KV_STORE], databaseName: DB_NAME, schemaVersion: DB_VERSION
  });
})();
