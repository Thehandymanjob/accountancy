/* THA v247 — isolated asynchronous accounting repository prototype.
   Test-only: uses the existing IndexedDB kv store and a dedicated prototype key.
   It never reads, writes, or deletes the app's legacy accounting LocalStorage key.
*/
(function (root) {
  "use strict";

  const PROTOTYPE_KEY = "__tha_idb_accounting_prototype_v1__";
  const LEGACY_KEY = "tha_test226_accounting_v1";

  function foundation() {
    const api = root.HandymanStorageFoundation;
    if (!api || typeof api.openDatabase !== "function") {
      throw new Error("HandymanStorageFoundation is not loaded.");
    }
    if (!Array.isArray(api.stores) || !api.stores.includes("kv")) {
      throw new Error("The IndexedDB foundation does not expose the required kv store.");
    }
    return api;
  }

  function assertPrototypeKey(key) {
    const value = String(key || "");
    if (value === LEGACY_KEY || !value.startsWith("__tha_idb_accounting_prototype")) {
      throw new Error("Refusing to access a non-prototype accounting key.");
    }
    return value;
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
    });
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    });
  }

  function validateAccounting(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Accounting payload must be an object.");
    }
    if (!Array.isArray(value.entries)) throw new Error("Accounting payload must contain an entries array.");
    if (value.customers !== undefined && !Array.isArray(value.customers)) {
      throw new Error("Accounting customers must be an array.");
    }
    if (value.invoices !== undefined && !Array.isArray(value.invoices)) {
      throw new Error("Accounting invoices must be an array.");
    }
    return value;
  }

  async function readRaw(key) {
    const api = foundation();
    const db = await api.openDatabase();
    try {
      const tx = db.transaction(["kv"], "readonly");
      const record = await requestValue(tx.objectStore("kv").get(assertPrototypeKey(key)));
      return record ? record.value : null;
    } finally {
      db.close();
    }
  }

  async function writeRaw(key, raw) {
    const api = foundation();
    const db = await api.openDatabase();
    try {
      const tx = db.transaction(["kv"], "readwrite");
      tx.objectStore("kv").put({
        key: assertPrototypeKey(key),
        value: raw,
        byteLength: new Blob([raw]).size,
        updatedAt: new Date().toISOString()
      });
      await txDone(tx);
      const verifyTx = db.transaction(["kv"], "readonly");
      const saved = await requestValue(verifyTx.objectStore("kv").get(key));
      if (!saved || saved.value !== raw) throw new Error("IndexedDB save verification failed.");
      return { ok: true, byteLength: saved.byteLength };
    } finally {
      db.close();
    }
  }

  async function deleteRaw(key) {
    const api = foundation();
    const db = await api.openDatabase();
    try {
      const tx = db.transaction(["kv"], "readwrite");
      tx.objectStore("kv").delete(assertPrototypeKey(key));
      await txDone(tx);
      const verifyTx = db.transaction(["kv"], "readonly");
      const saved = await requestValue(verifyTx.objectStore("kv").get(key));
      if (saved) throw new Error("IndexedDB delete verification failed.");
      return true;
    } finally {
      db.close();
    }
  }

  function createRepository(options) {
    const key = assertPrototypeKey(options && options.key || PROTOTYPE_KEY);
    return Object.freeze({
      async load() {
        const raw = await readRaw(key);
        if (raw === null) return null;
        let value;
        try { value = JSON.parse(raw); }
        catch (_) { throw new Error("Stored accounting prototype payload is invalid JSON; it was not changed."); }
        return validateAccounting(value);
      },
      async save(value) {
        validateAccounting(value);
        const raw = JSON.stringify(value);
        if (typeof raw !== "string") throw new Error("Accounting payload could not be serialized.");
        return writeRaw(key, raw);
      },
      async remove() {
        return deleteRaw(key);
      },
      key
    });
  }

  async function selfTest() {
    const key = PROTOTYPE_KEY + "selftest";
    const repo = createRepository({ key });
    const fixture = {
      entries: [{ id: "prototype-entry-1", type: "income", amount: 12.34, date: "2026-11-05" }],
      customers: [{ id: "prototype-customer-1", name: "IDB prototype fixture" }],
      invoices: [{ id: "prototype-invoice-1", number: 90001, status: "Draft" }],
      customExpenseCategories: ["Prototype category"],
      settings: { businessName: "Prototype only" }
    };
    const checks = { initiallyEmpty: false, create: false, read: false, update: false, delete: false, legacyKeyGuard: false };
    let ownsTestKey = false;
    try {
      const initial = await repo.load();
      checks.initiallyEmpty = initial === null;
      if (!checks.initiallyEmpty) throw new Error("Prototype test key is not empty; refusing to overwrite or delete it.");
      try { createRepository({ key: LEGACY_KEY }); }
      catch (_) { checks.legacyKeyGuard = true; }
      if (!checks.legacyKeyGuard) throw new Error("Legacy accounting key guard did not block access.");
      await repo.save(fixture);
      ownsTestKey = true;
      checks.create = true;
      const loaded = await repo.load();
      checks.read = JSON.stringify(loaded) === JSON.stringify(fixture);
      if (!checks.read) throw new Error("Read-after-create did not match the fixture.");
      const updated = JSON.parse(JSON.stringify(fixture));
      updated.entries[0].amount = 56.78;
      updated.entries.push({ id: "prototype-entry-2", type: "expense", amount: 4.5, date: "2026-11-05" });
      await repo.save(updated);
      const reloaded = await repo.load();
      checks.update = !!reloaded && reloaded.entries.length === 2 &&
        reloaded.entries[0].amount === 56.78 && reloaded.entries[1].id === "prototype-entry-2";
      if (!checks.update) throw new Error("Read-after-update did not match the updated fixture.");
      await repo.remove();
      checks.delete = (await repo.load()) === null;
      if (!checks.delete) throw new Error("Delete verification failed.");
      checks.legacyKeyGuard = true;
      return { ok: true, database: foundation().databaseName, schemaVersion: foundation().schemaVersion,
        testKey: key, checks, legacyDataChanged: false, appCutover: false };
    } catch (error) {
      if (ownsTestKey) { try { await repo.remove(); } catch (_) {} }
      return { ok: false, database: foundation().databaseName, schemaVersion: foundation().schemaVersion,
        testKey: key, checks, legacyDataChanged: false, appCutover: false,
        error: String(error && error.message || error) };
    }
  }

  root.HandymanAccountingIDBPrototype = Object.freeze({
    createRepository,
    selfTest,
    prototypeKey: PROTOTYPE_KEY,
    legacyKeyProtected: LEGACY_KEY
  });
})(window);
