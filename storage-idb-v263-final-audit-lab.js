/* The Handyman Accountancy v263 — IndexedDB-only storage engine.
   This module deliberately has no LocalStorage, SessionStorage, cookies, or CacheStorage
   access. It is an isolated foundation and is not the application cutover by itself.
   All values are stored with IndexedDB structured cloning (including Blob/File).
*/
(function (root) {
  "use strict";

  const DB_NAME = "tha_v263_final_engine_audit_idb";
  const DB_VERSION = 1;
  const STORE = "records";
  const META = "metadata";
  const BUILD = "THA-263-FINAL-ENGINE-AUDIT-1";

  const validDomain = value => typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
  const validKey = value => typeof value === "string" && value.length > 0 && value.length <= 512;
  const recordId = (domain, key) => domain + ":" + encodeURIComponent(key);
  const clone = value => {
    if (typeof root.structuredClone === "function") return root.structuredClone(value);
    // IndexedDB performs structured cloning on write/read. This fallback is only
    // used for callback isolation and intentionally rejects binary values.
    if (value instanceof Blob || (typeof File !== "undefined" && value instanceof File)) {
      throw new Error("This browser requires structuredClone support for binary mutation values.");
    }
    return JSON.parse(JSON.stringify(value));
  };
  async function valuesEqual(a, b, seen = new WeakMap()) {
    if (Object.is(a, b)) return true;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
    let paired = seen.get(a);
    if (paired && paired.has(b)) return true;
    if (!paired) { paired = new WeakSet(); seen.set(a, paired); }
    paired.add(b);
    if (a instanceof Blob || b instanceof Blob) {
      if (!(a instanceof Blob) || !(b instanceof Blob) || a.size !== b.size || a.type !== b.type) return false;
      if (typeof File !== "undefined" && (a instanceof File || b instanceof File)) {
        if (!(a instanceof File) || !(b instanceof File) || a.name !== b.name || a.lastModified !== b.lastModified) return false;
      }
      const [ab, bb] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
      if (ab.byteLength !== bb.byteLength) return false;
      const av = new Uint8Array(ab), bv = new Uint8Array(bb);
      for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
      return true;
    }
    if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
    if (a instanceof ArrayBuffer || b instanceof ArrayBuffer) {
      if (!(a instanceof ArrayBuffer) || !(b instanceof ArrayBuffer) || a.byteLength !== b.byteLength) return false;
      const av = new Uint8Array(a), bv = new Uint8Array(b);
      for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
      return true;
    }
    if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
      if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.constructor !== b.constructor || a.byteLength !== b.byteLength) return false;
      const av = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      const bv = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
      return true;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!(await valuesEqual(a[i], b[i], seen))) return false;
      return true;
    }
    const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
    if (ak.length !== bk.length || ak.some((key, i) => key !== bk[i])) return false;
    for (const key of ak) if (!(await valuesEqual(a[key], b[key], seen))) return false;
    return true;
  }

  const requestResult = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
  const transactionDone = tx => new Promise((resolve, reject) => {
    let requestError = null;
    tx.oncomplete = resolve;
    tx.onabort = () => {
      const error = tx.error || requestError;
      reject(new Error("IndexedDB transaction aborted" +
        (error ? " [" + error.name + "]: " + error.message : " without a transaction error.")));
    };
    // Request errors bubble to the transaction. Capture the originating request
    // error, but allow IndexedDB to complete the abort sequence.
    tx.onerror = event => {
      if (event && event.target && event.target.error) requestError = event.target.error;
    };
  });

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error("IndexedDB is unavailable in this browser."));
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("domain", "domain", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("Could not open IndexedDB database."));
      request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another open tab."));
    });
  }

  function guardWrite(tx, action, allowLocked) {
    const request = tx.objectStore(META).get("resetLock");
    request.onsuccess = () => {
      const lock = request.result;
      if (lock && lock.active && !allowLocked) { try { tx.abort(); } catch (_) {} return; }
      action();
    };
  }
  function validateDescriptor(domain, key) {
    if (!validDomain(domain) || !validKey(key)) throw new Error("Invalid IndexedDB domain or key.");
    return { id: recordId(domain, key), domain, key };
  }
  function validateValue(value) {
    if (value === undefined) throw new Error("Undefined cannot be stored; use null explicitly.");
    // Validate structured-clone compatibility before opening a write transaction.
    if (typeof root.structuredClone === "function") {
      try { root.structuredClone(value); } catch (error) {
        throw new Error("Value cannot be stored by IndexedDB structured cloning: " + (error.message || error));
      }
    } else if (typeof value === "function" || typeof value === "symbol") {
      throw new Error("Functions and Symbols cannot be stored in IndexedDB.");
    }
    return value;
  }
  function assertUnique(descriptors, label) {
    const ids = new Set();
    for (const item of descriptors) {
      if (ids.has(item.id)) throw new Error("Duplicate key in " + label + ": " + item.domain + "/" + item.key);
      ids.add(item.id);
    }
  }

  async function ready() {
    const db = await openDatabase();
    try {
      const tx = db.transaction([META], "readwrite");
      const done = transactionDone(tx);
      const store = tx.objectStore(META);
      const request = store.get("schema");
      let validationError = null;
      request.onsuccess = () => {
        const current = request.result;
        if (current && current.version !== 1) {
          validationError = new Error("Unexpected v263 schema metadata.");
          try { tx.abort(); } catch (_) {}
          return;
        }
        if (!current) store.put({ key: "schema", version: 1, database: DB_NAME, build: BUILD, createdAt: new Date().toISOString() });
      };
      try { await done; } catch (error) { if (validationError) throw validationError; throw error; }
      return { ok: true, database: DB_NAME, schemaVersion: DB_VERSION, build: BUILD };
    } finally { db.close(); }
  }

  async function get(domain, key) {
    const item = validateDescriptor(domain, key);
    const db = await openDatabase();
    try {
      const tx = db.transaction([STORE], "readonly");
      const done = transactionDone(tx);
      const row = await requestResult(tx.objectStore(STORE).get(item.id));
      await done;
      return row ? row.value : null;
    } finally { db.close(); }
  }

  async function readMany(descriptors) {
    if (!Array.isArray(descriptors) || descriptors.length === 0) throw new Error("A non-empty descriptor list is required.");
    const prepared = descriptors.map(x => validateDescriptor(x.domain, x.key));
    assertUnique(prepared, "read");
    const db = await openDatabase();
    try {
      const tx = db.transaction([STORE], "readonly");
      const done = transactionDone(tx);
      const store = tx.objectStore(STORE);
      const rows = await Promise.all(prepared.map(x => requestResult(store.get(x.id))));
      await done;
      return { ok: true, records: rows.map((row, i) => ({
        domain: prepared[i].domain, key: prepared[i].key, value: row ? row.value : null
      })) };
    } finally { db.close(); }
  }

  async function put(domain, key, value) {
    const item = validateDescriptor(domain, key);
    validateValue(value);
    const stamp = new Date().toISOString();
    const db = await openDatabase();
    try {
      const tx = db.transaction([STORE, META], "readwrite");
      const done = transactionDone(tx);
      guardWrite(tx, () => tx.objectStore(STORE).put({ ...item, value, updatedAt: stamp }), false);
      await done;
      const saved = await get(domain, key);
      // IndexedDB structured cloning preserves binary objects; compare primitive JSON
      // values only here. Binary round-trip is covered by the self-test.
      if (!(await valuesEqual(saved, value))) {
        throw new Error("IndexedDB content read-back verification failed for " + domain + "/" + key);
      }
      return { ok: true, domain, key, updatedAt: stamp };
    } finally { db.close(); }
  }

  async function remove(domain, key) {
    const item = validateDescriptor(domain, key);
    const db = await openDatabase();
    try {
      const tx = db.transaction([STORE, META], "readwrite");
      const done = transactionDone(tx);
      guardWrite(tx, () => tx.objectStore(STORE).delete(item.id), false);
      await done;
      const check = await get(domain, key);
      if (check !== null) throw new Error("IndexedDB delete verification failed for " + domain + "/" + key);
      return { ok: true, removed: true, domain, key };
    } finally { db.close(); }
  }

  async function transact(writes) {
    if (!Array.isArray(writes) || writes.length === 0) throw new Error("A non-empty write list is required.");
    const prepared = writes.map(x => {
      const item = validateDescriptor(x.domain, x.key);
      validateValue(x.value);
      return { ...item, value: x.value };
    });
    assertUnique(prepared, "transaction");
    const stamp = new Date().toISOString();
    const db = await openDatabase();
    try {
      const tx = db.transaction([STORE, META], "readwrite");
      const done = transactionDone(tx);
      const store = tx.objectStore(STORE);
      guardWrite(tx, () => { for (const item of prepared) store.put({ ...item, updatedAt: stamp }); }, false);
      await done;
      const verify = await readMany(prepared);
      for (let i = 0; i < prepared.length; i++) {
        if (!(await valuesEqual(verify.records[i].value, prepared[i].value))) {
          throw new Error("IndexedDB transaction content verification failed for " + prepared[i].domain + "/" + prepared[i].key);
        }
      }
      return { ok: true, written: prepared.length, updatedAt: stamp };
    } finally { db.close(); }
  }

  async function mutateMany(descriptors, updater) {
    if (!Array.isArray(descriptors) || descriptors.length === 0 || typeof updater !== "function") {
      throw new Error("A non-empty descriptor list and synchronous updater are required.");
    }
    const prepared = descriptors.map(x => ({
      ...validateDescriptor(x.domain, x.key),
      initialValue: x.initialValue === undefined ? null : x.initialValue
    }));
    assertUnique(prepared, "mutation");
    const db = await openDatabase();
    const stamp = new Date().toISOString();
    try {
      const tx = db.transaction([STORE, META], "readwrite");
      const done = transactionDone(tx);
      const store = tx.objectStore(STORE);
      const currentRows = new Array(prepared.length);
      let received = 0;
      let next;
      let mutationError = null;

      // Keep every operation that touches this transaction inside IndexedDB
      // request callbacks. Safari may auto-commit a transaction across an
      // awaited Promise continuation, even when another request is expected.
      guardWrite(tx, () => {
      const requests = prepared.map((item, index) => {
        const request = store.get(item.id);
        request.onsuccess = () => {
          currentRows[index] = request.result || null;
          received++;
          if (received !== prepared.length) return;
          try {
            const current = currentRows.map((row, i) => ({
              domain: prepared[i].domain,
              key: prepared[i].key,
              value: row ? row.value : clone(prepared[i].initialValue)
            }));
            next = updater(clone(current));
            if (next && typeof next.then === "function") throw new Error("IndexedDB mutation callback must be synchronous.");
            if (!Array.isArray(next) || next.length !== prepared.length) throw new Error("Mutation must return one value per descriptor.");
            // Validate every value before issuing the first write, preventing partial batches.
            for (const value of next) validateValue(value);
            for (let i = 0; i < prepared.length; i++) {
              store.put({ id: prepared[i].id, domain: prepared[i].domain, key: prepared[i].key, value: next[i], updatedAt: stamp });
            }
          } catch (error) {
            mutationError = error;
            try { tx.abort(); } catch (_) {}
          }
        };
      });
      }, false);

      try { await done; } catch (error) {
        if (mutationError) throw mutationError;
        throw error;
      }
      if (mutationError) throw mutationError;
      const verified = await readMany(prepared);
      for (let i = 0; i < prepared.length; i++) {
        if (!(await valuesEqual(verified.records[i].value, next[i]))) {
          throw new Error("IndexedDB mutation content read-back failed for " + prepared[i].domain + "/" + prepared[i].key);
        }
      }
      return { ok: true, updated: prepared.length, records: verified.records, updatedAt: stamp };
    } finally { db.close(); }
  }

  async function reserveCounter(domain, key, minimum) {
    const item = validateDescriptor(domain, key);
    const floor = Number(minimum) || 0;
    const db = await openDatabase();
    const stamp = new Date().toISOString();
    let reserved;
    try {
      const tx = db.transaction([STORE, META], "readwrite");
      const done = transactionDone(tx);
      const store = tx.objectStore(STORE);
      let request;
      let operationError = null;
      guardWrite(tx, () => { request = store.get(item.id);
      request.onsuccess = () => {
        try {
          const current = request.result ? request.result.value : 0;
          reserved = Math.max(Number(current) || 0, floor) + 1;
          validateValue(reserved);
          store.put({ ...item, value: reserved, updatedAt: stamp });
        } catch (error) {
          operationError = error;
          try { tx.abort(); } catch (_) {}
        }
      };
      }, false);
      try { await done; } catch (error) {
        if (operationError) throw operationError;
        throw error;
      }
      if (operationError) throw operationError;
      // Do not compare a reservation with a later global read: another
      // concurrent caller may already have advanced the counter. Transaction
      // completion confirms this reservation committed; uniqueness is verified
      // by the concurrent self-test and final counter value.
      return { ok: true, value: reserved };
    } finally { db.close(); }
  }

  async function snapshot(domains) {
    if (!Array.isArray(domains) || domains.some(x => !validDomain(x))) throw new Error("Invalid snapshot domains.");
    const db = await openDatabase();
    try {
      const tx = db.transaction([STORE], "readonly");
      const done = transactionDone(tx);
      const rows = await requestResult(tx.objectStore(STORE).getAll());
      await done;
      return {
        format: "tha-v263-indexeddb-snapshot-v1",
        database: DB_NAME,
        createdAt: new Date().toISOString(),
        domains: [...new Set(domains)].sort(),
        records: rows.filter(x => domains.includes(x.domain)).sort((a, b) => a.id.localeCompare(b.id))
      };
    } finally { db.close(); }
  }

  async function restore(packageValue) {
    if (!packageValue || packageValue.format !== "tha-v263-indexeddb-snapshot-v1" ||
        packageValue.database !== DB_NAME || !Array.isArray(packageValue.domains) ||
        !Array.isArray(packageValue.records)) throw new Error("Invalid v263 IndexedDB backup package.");
    const domains = [...new Set(packageValue.domains)];
    if (domains.length !== packageValue.domains.length || domains.some(x => !validDomain(x))) throw new Error("Invalid or duplicate backup domains.");
    const prepared = packageValue.records.map(row => {
      const item = validateDescriptor(row.domain, row.key);
      if (!domains.includes(row.domain)) throw new Error("Backup record is outside the declared domains.");
      validateValue(row.value);
      return { ...item, value: row.value };
    });
    assertUnique(prepared, "restore");
    const db = await openDatabase();
    try {
      const tx = db.transaction([STORE, META], "readwrite");
      const done = transactionDone(tx);
      const store = tx.objectStore(STORE);
      const request = store.getAll();
      let mutationError = null;
      request.onsuccess = () => {
        try {
          const existing = request.result || [];
          for (const row of existing) if (domains.includes(row.domain)) store.delete(row.id);
          const stamp = new Date().toISOString();
          for (const row of prepared) store.put({ ...row, updatedAt: stamp });
          tx.objectStore(META).put({key:"resetLock",active:false,updatedAt:stamp});
        } catch (error) {
          mutationError = error;
          try { tx.abort(); } catch (_) {}
        }
      };
      try { await done; } catch (error) {
        if (mutationError) throw mutationError;
        throw error;
      }
      if (mutationError) throw mutationError;
      const verify = await snapshot(domains);
      const expected = prepared.slice().sort((a, b) => a.id.localeCompare(b.id));
      if (verify.records.length !== expected.length) throw new Error("IndexedDB restore record-count verification failed.");
      for (let i = 0; i < expected.length; i++) {
        const actual = verify.records[i], wanted = expected[i];
        if (actual.id !== wanted.id || !(await valuesEqual(actual.value, wanted.value))) {
          throw new Error("IndexedDB restore content verification failed for " + wanted.domain + "/" + wanted.key);
        }
      }
      return { ok: true, restored: prepared.length, domains };
    } finally { db.close(); }
  }

  async function beginResetLock() {
    const db = await openDatabase();
    try {
      const tx = db.transaction([META], "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(META).put({key:"resetLock",active:true,updatedAt:new Date().toISOString()});
      await done;
      const check = db.transaction([META], "readonly");
      const req = check.objectStore(META).get("resetLock");
      const lock = await requestResult(req);
      await transactionDone(check);
      if (!lock || lock.active !== true) throw new Error("Could not verify persistent reset lock.");
      return {ok:true,locked:true};
    } finally { db.close(); }
  }
  async function clearWhileResetLocked() {
    const db = await openDatabase();
    try {
      const tx = db.transaction([STORE, META], "readwrite");
      const done = transactionDone(tx);
      const lockReq = tx.objectStore(META).get("resetLock");
      lockReq.onsuccess = () => {
        if (!lockReq.result || lockReq.result.active !== true) { try { tx.abort(); } catch (_) {} return; }
        tx.objectStore(STORE).clear();
      };
      await done;
      const verify = db.transaction([STORE, META], "readonly");
      const rowsReq = verify.objectStore(STORE).getAll();
      const lockCheck = verify.objectStore(META).get("resetLock");
      const [rows, lock] = await Promise.all([requestResult(rowsReq),requestResult(lockCheck)]);
      await transactionDone(verify);
      if (rows.length || !lock || !lock.active) throw new Error("Locked clear verification failed.");
      return {ok:true,remainingRecords:0,locked:true};
    } finally { db.close(); }
  }

  async function releaseResetLock() {
    const db = await openDatabase();
    try {
      const tx = db.transaction([META], "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(META).put({key:"resetLock",active:false,updatedAt:new Date().toISOString()});
      await done;
      return {ok:true,unlocked:true};
    } finally { db.close(); }
  }
  async function health() {
    const db = await openDatabase();
    try {
      const tx = db.transaction([STORE, META], "readonly");
      const done = transactionDone(tx);
      const [rows, meta, resetLock] = await Promise.all([
        requestResult(tx.objectStore(STORE).getAll()),
        requestResult(tx.objectStore(META).get("schema")),
        requestResult(tx.objectStore(META).get("resetLock"))
      ]);
      await done;
      const counts = {};
      for (const row of rows) counts[row.domain] = (counts[row.domain] || 0) + 1;
      return { ok: true, database: DB_NAME, schemaVersion: DB_VERSION, build: meta ? meta.build : null, totalRecords: rows.length, counts, resetLocked: !!(resetLock && resetLock.active) };
    } finally { db.close(); }
  }

  async function selfTest() {
    const token = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const domain = "selftest_" + token;
    const checks = { ready: false, jsonRoundTrip: false, blobRoundTrip: false, atomicWrite: false, concurrentCounterReservation: false, snapshotRestore: false, delete: false };
    const stepErrors = {};
    const keys = ["json", "blob", "atomic-a", "atomic-b", "counter", "snapshot"];

    try {
      await ready(); checks.ready = true;
      const sample = { n: 7, text: "test", empty: "", nested: [1, null, false] };
      await put(domain, keys[0], sample);
      const read = await get(domain, keys[0]);
      checks.jsonRoundTrip = JSON.stringify(read) === JSON.stringify(sample);
      if (!checks.jsonRoundTrip) throw new Error("JSON round-trip failed.");
      const blob = new Blob(["THA-v263-IDB-BLOB-TEST"], { type: "text/plain" });
      await put(domain, keys[1], blob);
      const blobRead = await get(domain, keys[1]);
      checks.blobRoundTrip = blobRead instanceof Blob && blobRead.size === blob.size && blobRead.type === blob.type &&
        (await blobRead.text()) === "THA-v263-IDB-BLOB-TEST";
      if (!checks.blobRoundTrip) throw new Error("Blob round-trip failed.");
      await transact([
        { domain, key: keys[2], value: { value: "A" } },
        { domain, key: keys[3], value: { value: "B" } }
      ]);
      const pair = await readMany([{ domain, key: keys[2] }, { domain, key: keys[3] }]);
      checks.atomicWrite = pair.records[0].value.value === "A" && pair.records[1].value.value === "B";
      if (!checks.atomicWrite) throw new Error("Atomic write test failed.");
      const reservations = await Promise.all(Array.from({ length: 6 }, () => reserveCounter(domain, keys[4], 0)));
      const numbers = reservations.map(x => x.value).sort((a, b) => a - b);
      checks.concurrentCounterReservation = numbers.length === 6 &&
        numbers.every((value, index) => value === index + 1) &&
        (await get(domain, keys[4])) === 6;
      if (!checks.concurrentCounterReservation) throw new Error("Concurrent counter reservation produced duplicate or missing numbers.");
      await put(domain, keys[5], { label: "snapshot", attachment: new Blob(["snapshot-binary-v263"], { type: "text/plain" }) });
      const savedSnapshot = await snapshot([domain]);
      await put(domain, keys[5], { label: "changed", attachment: new Blob(["different"], { type: "text/plain" }) });
      const restored = await restore(savedSnapshot);
      const restoredValue = await get(domain, keys[5]);
      checks.snapshotRestore = restored.ok && restored.restored === 6 &&
        restoredValue.label === "snapshot" &&
        restoredValue.attachment instanceof Blob &&
        (await restoredValue.attachment.text()) === "snapshot-binary-v263";
      if (!checks.snapshotRestore) throw new Error("Snapshot restore did not restore exact structured and binary content.");
      await remove(domain, keys[2]);
      checks.delete = (await get(domain, keys[2])) === null;
      if (!checks.delete) throw new Error("Delete test failed.");
      return { ok: Object.values(checks).every(Boolean), database: DB_NAME, build: BUILD, checks, noLocalStorageAccess: true, appCutover: false };
    } catch (error) {
      const detail = String(error && error.message || error);
      return { ok: false, database: DB_NAME, build: BUILD, checks, error: detail, stepErrors, appCutover: false };
    } finally {
      for (const key of keys) { try { await remove(domain, key); } catch (_) {} }
    }
  }

  root.HandymanStorageV263Audit = Object.freeze({
    databaseName: DB_NAME, schemaVersion: DB_VERSION, build: BUILD,
    ready, get, readMany, put, remove, transact, mutateMany, reserveCounter,
    snapshot, restore, beginResetLock, clearWhileResetLocked, releaseResetLock, health, selfTest
  });
})(window);
