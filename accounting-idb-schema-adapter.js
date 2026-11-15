/* THA v247 — schema-aware accounting repository adapter.
   Test-only prototype. Stores the complete accounting payload as one JSON value
   in the existing IndexedDB kv store; preserves unknown fields and raw values.
   No LocalStorage access and no application cutover.
*/
(function (root) {
  "use strict";
  const KEY = "__tha_idb_accounting_schema_v1__";
  const LEGACY_KEY = "tha_test226_accounting_v1";

  function api() {
    const a = root.HandymanStorageFoundation;
    if (!a || typeof a.openDatabase !== "function" ||
        !Array.isArray(a.stores) || !a.stores.includes("kv")) {
      throw new Error("Compatible storage foundation (kv store) is required.");
    }
    return a;
  }
  function assertKey(key) {
    if (key !== KEY) throw new Error("Only the dedicated accounting schema test key is allowed.");
    if (key === LEGACY_KEY) throw new Error("Legacy accounting key is protected.");
    return key;
  }
  function validate(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Error("Accounting payload must be an object.");
    for (const field of ["entries", "customers", "invoices", "customExpenseCategories", "thirdPartyTransactions"]) {
      if (payload[field] !== undefined && !Array.isArray(payload[field]))
        throw new Error(field + " must be an array when present.");
    }
    if (!Array.isArray(payload.entries) || !Array.isArray(payload.customers) || !Array.isArray(payload.invoices))
      throw new Error("Accounting payload must contain entries, customers and invoices arrays.");
    if (payload.settings !== undefined &&
        (!payload.settings || typeof payload.settings !== "object" || Array.isArray(payload.settings)))
      throw new Error("settings must be an object when present.");
    return payload;
  }
  function request(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB request failed."));
    });
  }
  function completed(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
    });
  }
  async function load() {
    const db = await api().openDatabase();
    try {
      const tx = db.transaction(["kv"], "readonly");
      const record = await request(tx.objectStore("kv").get(assertKey(KEY)));
      return record ? validate(JSON.parse(record.value)) : null;
    } finally { db.close(); }
  }
  async function save(payload) {
    validate(payload);
    const raw = JSON.stringify(payload);
    if (typeof raw !== "string") throw new Error("Accounting payload serialization failed.");
    const db = await api().openDatabase();
    try {
      const tx = db.transaction(["kv"], "readwrite");
      tx.objectStore("kv").put({key: assertKey(KEY), value: raw,
        byteLength: new Blob([raw]).size, updatedAt: new Date().toISOString()});
      await completed(tx);
      const verify = db.transaction(["kv"], "readonly");
      const saved = await request(verify.objectStore("kv").get(KEY));
      if (!saved || saved.value !== raw) throw new Error("Accounting round-trip verification failed.");
      return {ok:true, byteLength:saved.byteLength};
    } finally { db.close(); }
  }
  async function remove() {
    const db = await api().openDatabase();
    try {
      const tx = db.transaction(["kv"], "readwrite");
      tx.objectStore("kv").delete(assertKey(KEY));
      await completed(tx);
      const verify = db.transaction(["kv"], "readonly");
      if (await request(verify.objectStore("kv").get(KEY)))
        throw new Error("Accounting test-key cleanup failed.");
      return true;
    } finally { db.close(); }
  }
  function deepEqual(a,b) { return JSON.stringify(a) === JSON.stringify(b); }

  async function selfTest() {
    const checks = {emptyKey:true, schemaAccepted:false, unknownFieldsPreserved:false,
      nullAndBlankPreserved:false, nestedInvoiceItemsPreserved:false, roundTrip:false, cleanup:false};
    let ownsKey = false;
    try {
      const initial = await load();\n      checks.emptyKey = initial === null;\n      if (!checks.emptyKey) throw new Error("Test key already contains data; refusing to overwrite it.");
      const fixture = {
        entries:[{id:"test-entry-1",type:"income",date:"",amount:0,method:null,
          category:"",reference:"",notes:"",invoiceId:"test-invoice-1",createdAt:"2026-11-05T10:00:00Z",
          futureField:{keep:true}}],
        customers:[{id:"test-customer-1",name:"Synthetic Customer",phone:"",address:"",workAddress:null,email:""}],
        invoices:[{id:"test-invoice-1",number:90001,date:"2026-11-05",customerId:"test-customer-1",
          customerName:"Synthetic Customer",phone:"",billingAddress:"",workAddress:"",description:"",
          qty:0,unitPrice:0,vat:0,status:"Issued",notes:"",historical:false,paymentStatus:"Paid",
          paymentDate:"",paymentMethod:null,items:[{description:"",qty:1,unitPrice:0,unknownItemField:"keep"}],
          updatedAt:"2026-11-05T10:00:00Z"}],
        customExpenseCategories:["Project expenses"], settings:{businessName:"Synthetic business",ownerName:""},
        thirdPartyTransactions:[], unknownTopLevel:{preserve:[1,null,"x"]}
      };
      validate(fixture); checks.schemaAccepted = true;
      checks.unknownFieldsPreserved = fixture.unknownTopLevel.unknown === undefined;
      const result = await save(fixture); ownsKey = true;
      const loaded = await load();
      checks.nullAndBlankPreserved = loaded.entries[0].method === null &&
        loaded.entries[0].date === "" && loaded.customers[0].workAddress === null;
      checks.nestedInvoiceItemsPreserved = loaded.invoices[0].items[0].unknownItemField === "keep";
      checks.unknownFieldsPreserved = loaded.unknownTopLevel.preserve[1] === null &&
        loaded.entries[0].futureField.keep === true;
      checks.roundTrip = deepEqual(loaded, fixture) && result.ok === true;
      if (!Object.values(checks).every(Boolean))
        throw new Error("One or more schema round-trip checks failed.");
      await remove(); ownsKey = false;
      checks.cleanup = (await load()) === null;
      return {ok:true,database:api().databaseName,schemaVersion:api().schemaVersion,
        checks,legacyDataChanged:false,appCutover:false};
    } catch (e) {
      if (ownsKey) { try { await remove(); } catch (_) {} }
      return {ok:false,checks,legacyDataChanged:false,appCutover:false,
        error:String(e && e.message || e)};
    }
  }
  root.HandymanAccountingSchemaAdapter = Object.freeze({load,save,remove,selfTest,validate});
})(window);
