/* The Handyman Accountancy v250 — isolated IndexedDB Storage Repository.
   Design-stage adapter. Not referenced by index.html; no application cutover.
   It creates only the dedicated v250 database when explicitly opened by a test harness.
   It never reads, writes, migrates, or deletes LocalStorage.
*/
(function(root){
 "use strict";
 const DB_NAME="the_handyman_accountancy_v250_idb";
 const DB_VERSION=1;
 const STORE="records";
 const SELF_TEST_BUILD="repo-selftest-20261107-05";
 const EXPECTED_CHECKS=["ready","roundTrip","atomicBatch","atomicMultiDomainMutation","abortRollback","concurrentWrites","concurrentCounterReservation","snapshotRestore","restoreRemovesStaleRecords","restorePreservesOtherDomains","emptySnapshotRestore","cleanup"];
 const META="metadata";
 const SCHEMA_KEY="schema";
 const canonical=value=>{
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
  return JSON.stringify(value);
 };
 const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
 const requestResult=req=>new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||new Error("IndexedDB request failed."));
 });
 const txDone=tx=>new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();
  tx.onabort=()=>reject(tx.error||new Error("IndexedDB transaction aborted."));
  tx.onerror=()=>reject(tx.error||new Error("IndexedDB transaction failed."));
 });
 const validName=value=>typeof value==="string"&&/^[a-z][a-z0-9_-]{0,63}$/.test(value);
 const validKey=value=>typeof value==="string"&&value.length>0&&value.length<=512;
 function open(){
  return new Promise((resolve,reject)=>{
   if(!root.indexedDB)return reject(new Error("IndexedDB is unavailable."));
   const req=root.indexedDB.open(DB_NAME,DB_VERSION);
   req.onupgradeneeded=()=>{
    const db=req.result;
    if(!db.objectStoreNames.contains(STORE)){
     const records=db.createObjectStore(STORE,{keyPath:"id"});
     records.createIndex("domain","domain",{unique:false});
     records.createIndex("updatedAt","updatedAt",{unique:false});
    }
    if(!db.objectStoreNames.contains(META))db.createObjectStore(META,{keyPath:"key"});
   };
   req.onsuccess=()=>{
    const db=req.result;
    db.onversionchange=()=>db.close();
    resolve(db);
   };
   req.onerror=()=>reject(req.error||new Error("Could not open v250 IndexedDB."));
   req.onblocked=()=>reject(new Error("Database upgrade is blocked by another open tab."));
  });
 }
 function recordId(domain,key){return domain+"/"+key;}
 function validateValue(value){
  if(value===undefined)throw new Error("Undefined cannot be stored; use null explicitly.");
  const raw=JSON.stringify(value);
  if(typeof raw!=="string")throw new Error("Value is not JSON serializable.");
  return raw;
 }
 async function ready(){
  const db=await open();
  try{
   const tx=db.transaction([META],"readwrite"),done=txDone(tx),store=tx.objectStore(META);
   const old=await requestResult(store.get(SCHEMA_KEY));
   if(old&&old.version!==1)throw new Error("Unexpected repository schema metadata version.");
   if(!old)store.put({key:SCHEMA_KEY,version:1,database:DB_NAME,createdAt:new Date().toISOString()});
   await done;
   return {ok:true,database:DB_NAME,schemaVersion:DB_VERSION,appDataSchemaVersion:1};
  }finally{db.close();}
 }
 async function get(domain,key){
  if(!validName(domain)||!validKey(key))throw new Error("Invalid domain or record key.");
  const db=await open();
  try{
   const tx=db.transaction([STORE],"readonly"),done=txDone(tx);
   const row=await requestResult(tx.objectStore(STORE).get(recordId(domain,key)));
   await done;
   if(!row)return null;
   const value=JSON.parse(row.raw);
   return clone(value);
  }finally{db.close();}
 }
 async function readMany(descriptors){
  if(!Array.isArray(descriptors)||descriptors.length===0)throw new Error("A non-empty descriptors array is required.");
  const prepared=descriptors.map(item=>{
   if(!item||!validName(item.domain)||!validKey(item.key))throw new Error("Invalid read descriptor.");
   return {domain:item.domain,key:item.key,id:recordId(item.domain,item.key)};
  });
  const ids=new Set();for(const item of prepared){if(ids.has(item.id))throw new Error("Duplicate key in read: "+item.id);ids.add(item.id);}
  const db=await open();
  try{
   const tx=db.transaction([STORE],"readonly"),done=txDone(tx),store=tx.objectStore(STORE);
   const requests=prepared.map(item=>requestResult(store.get(item.id)));
   const rows=await Promise.all(requests);await done;
   return {ok:true,records:rows.map((row,i)=>({domain:prepared[i].domain,key:prepared[i].key,value:row?clone(JSON.parse(row.raw)):null}))};
  }finally{db.close();}
 }
 async function put(domain,key,value){
  if(!validName(domain)||!validKey(key))throw new Error("Invalid domain or record key.");
  const raw=validateValue(value),id=recordId(domain,key),updatedAt=new Date().toISOString();
  const db=await open();
  try{
   const tx=db.transaction([STORE],"readwrite"),done=txDone(tx);
   tx.objectStore(STORE).put({id,domain,key,raw,updatedAt,byteLength:new Blob([raw]).size});
   await done;
   const verifyTx=db.transaction([STORE],"readonly"),verifyDone=txDone(verifyTx);
   const saved=await requestResult(verifyTx.objectStore(STORE).get(id));
   await verifyDone;
   if(!saved||saved.raw!==raw)throw new Error("IndexedDB read-back verification failed for "+id);
   return {ok:true,domain,key,byteLength:saved.byteLength,updatedAt};
  }finally{db.close();}
 }
 async function remove(domain,key){
  if(!validName(domain)||!validKey(key))throw new Error("Invalid domain or record key.");
  const id=recordId(domain,key),db=await open();
  try{
   const tx=db.transaction([STORE],"readwrite"),done=txDone(tx);
   tx.objectStore(STORE).delete(id);await done;
   const check=db.transaction([STORE],"readonly"),checkDone=txDone(check);
   const row=await requestResult(check.objectStore(STORE).get(id));await checkDone;
   if(row)throw new Error("IndexedDB delete verification failed for "+id);
   return {ok:true,removed:true,domain,key};
  }finally{db.close();}
 }
 async function transact(writes){
  if(!Array.isArray(writes)||writes.length===0)throw new Error("A non-empty writes array is required.");
  const prepared=writes.map(item=>{
   if(!item||!validName(item.domain)||!validKey(item.key))throw new Error("Invalid transaction record descriptor.");
   return {id:recordId(item.domain,item.key),domain:item.domain,key:item.key,raw:validateValue(item.value)};
  });
  const ids=new Set();for(const item of prepared){if(ids.has(item.id))throw new Error("Duplicate key in transaction: "+item.id);ids.add(item.id);}
  const db=await open();
  try{
   const tx=db.transaction([STORE],"readwrite"),done=txDone(tx),store=tx.objectStore(STORE),stamp=new Date().toISOString();
   for(const item of prepared)store.put({...item,updatedAt:stamp,byteLength:new Blob([item.raw]).size});
   await done;
   const verify=db.transaction([STORE],"readonly"),verifyDone=txDone(verify),read=verify.objectStore(STORE);
   for(const item of prepared){const row=await requestResult(read.get(item.id));if(!row||row.raw!==item.raw)throw new Error("Atomic transaction read-back failed for "+item.id);}
   await verifyDone;
   return {ok:true,written:prepared.length,updatedAt:stamp};
  }finally{db.close();}
 }
 async function mutate(operations){
  if(!Array.isArray(operations)||operations.length===0)throw new Error("A non-empty operations array is required.");
  const prepared=operations.map(item=>{
   if(!item||!validName(item.domain)||!validKey(item.key)||typeof item.update!=="function")
    throw new Error("Each mutation requires a valid domain, key and synchronous update function.");
   return {id:recordId(item.domain,item.key),domain:item.domain,key:item.key,update:item.update,initialValue:item.initialValue};
  });
  const ids=new Set();for(const item of prepared){if(ids.has(item.id))throw new Error("Duplicate key in mutation: "+item.id);ids.add(item.id);}
  const db=await open(),values={},stamp=new Date().toISOString();
  try{
   const tx=db.transaction([STORE],"readwrite"),done=txDone(tx),store=tx.objectStore(STORE);
   let callbackError=null;
   for(const item of prepared){
    const req=store.get(item.id);
    req.onsuccess=()=>{
     if(callbackError)return;
     try{
      const current=req.result?JSON.parse(req.result.raw):clone(item.initialValue===undefined?null:item.initialValue);
      const next=item.update(clone(current));
      if(next===undefined)throw new Error("Mutation returned undefined for "+item.id);
      const raw=validateValue(next);
      values[item.id]=JSON.parse(raw);
      store.put({id:item.id,domain:item.domain,key:item.key,raw,updatedAt:stamp,byteLength:new Blob([raw]).size});
     }catch(error){callbackError=error;try{tx.abort()}catch(_){}}
    };
   }
   try{await done}catch(error){throw callbackError||error;}
   const verify=db.transaction([STORE],"readonly"),verifyDone=txDone(verify),read=verify.objectStore(STORE);
   for(const item of prepared){
    const row=await requestResult(read.get(item.id));
    // A later serialized write may commit before this verification read executes.
    // Transaction completion is the commit guarantee; verify identity and valid JSON,
    // while operation-specific tests verify the value returned by this transaction.
    if(!row||row.id!==item.id||row.domain!==item.domain||row.key!==item.key)
     throw new Error("Mutation read-back verification failed for "+item.id);
    try{JSON.parse(row.raw)}catch(_){throw new Error("Mutation read-back contains invalid JSON for "+item.id)}
   }
   await verifyDone;
   return {ok:true,updated:prepared.length,values:clone(values),updatedAt:stamp};
  }finally{db.close();}
 }
 async function mutateMany(descriptors,updater){
  if(!Array.isArray(descriptors)||descriptors.length===0||typeof updater!=="function")
   throw new Error("A non-empty descriptors array and synchronous updater are required.");
  const prepared=descriptors.map(item=>{
   if(!item||!validName(item.domain)||!validKey(item.key))
    throw new Error("Invalid multi-record mutation descriptor.");
   return {domain:item.domain,key:item.key,id:recordId(item.domain,item.key),initialValue:item.initialValue};
  });
  const ids=new Set();
  for(const item of prepared){if(ids.has(item.id))throw new Error("Duplicate key in multi-record mutation: "+item.id);ids.add(item.id);}
  const db=await open(),stamp=new Date().toISOString();
  try{
   const tx=db.transaction([STORE],"readwrite"),done=txDone(tx),store=tx.objectStore(STORE);
   let remaining=prepared.length,callbackError=null,committedValues=null,verificationRemaining=0,verified=false;
   const fail=error=>{
    if(callbackError)return;
    callbackError=error instanceof Error?error:new Error(String(error));
    try{tx.abort()}catch(_){}
   };
   const verifyInsideTransaction=()=>{
    verificationRemaining=prepared.length;
    prepared.forEach((item,index)=>{
     const req=store.get(item.id);
     req.onsuccess=()=>{
      if(callbackError)return;
      try{
       const row=req.result;
       if(!row||row.raw!==validateValue(committedValues[index]))
        throw new Error("Multi-record in-transaction verification failed for "+item.id);
       verificationRemaining--;
       if(verificationRemaining===0)verified=true;
      }catch(error){fail(error)}
     };
     req.onerror=()=>fail(req.error||new Error("Multi-record verification read failed for "+item.id));
    });
   };
   prepared.forEach(item=>{
    const req=store.get(item.id);
    req.onsuccess=()=>{
     if(callbackError)return;
     try{
      item.current=req.result?clone(JSON.parse(req.result.raw)):clone(item.initialValue===undefined?null:item.initialValue);
      remaining--;
      if(remaining!==0)return;
      const current=prepared.map(x=>({domain:x.domain,key:x.key,value:clone(x.current)}));
      const next=updater(current);
      if(next&&typeof next.then==="function")
       throw new Error("Multi-record updater must be synchronous; Promise results are not supported.");
      if(!Array.isArray(next)||next.length!==prepared.length)
       throw new Error("Multi-record updater must return one replacement value per descriptor, in descriptor order.");
      const encoded=next.map((value,i)=>({item:prepared[i],raw:validateValue(value)}));
      committedValues=encoded.map(x=>JSON.parse(x.raw));
      for(const entry of encoded)
       store.put({id:entry.item.id,domain:entry.item.domain,key:entry.item.key,raw:entry.raw,updatedAt:stamp,byteLength:new Blob([entry.raw]).size});
      verifyInsideTransaction();
     }catch(error){fail(error)}
    };
    req.onerror=()=>fail(req.error||new Error("Multi-record read failed for "+item.id));
   });
   try{await done}catch(error){throw callbackError||error;}
   if(!committedValues||!verified)
    throw new Error("Multi-record transaction completed without successful in-transaction verification.");
   return {ok:true,updated:prepared.length,records:prepared.map((item,i)=>({domain:item.domain,key:item.key,value:clone(committedValues[i])})),updatedAt:stamp};
  }finally{db.close();}
 }
 async function reserveCounter(domain,key,minimum){
  const floor=Number(minimum)||0;
  const result=await mutate([{domain,key,initialValue:0,update:current=>Math.max(Number(current)||0,floor)+1}]);
  return {ok:true,value:result.values[recordId(domain,key)]};
 }
 async function snapshot(domains){
  if(!Array.isArray(domains)||domains.some(x=>!validName(x)))throw new Error("domains must be an array of valid names.");
  const db=await open();
  try{
   const tx=db.transaction([STORE],"readonly"),done=txDone(tx),rows=await requestResult(tx.objectStore(STORE).getAll());
   await done;
   const selected=rows.filter(row=>domains.includes(row.domain)).sort((a,b)=>a.id.localeCompare(b.id));
   return {format:"tha-idb-repository-snapshot-v1",database:DB_NAME,createdAt:new Date().toISOString(),
    domains:[...domains],records:selected.map(row=>({domain:row.domain,key:row.key,value:JSON.parse(row.raw)}))};
  }finally{db.close();}
 }
 async function restore(snapshotValue){
  if(!snapshotValue||snapshotValue.format!=="tha-idb-repository-snapshot-v1"||
     snapshotValue.database!==DB_NAME||!Array.isArray(snapshotValue.domains)||!Array.isArray(snapshotValue.records))
   throw new Error("Unsupported repository snapshot or database mismatch.");
  const domains=snapshotValue.domains;
  if(domains.some(x=>!validName(x))||new Set(domains).size!==domains.length)
   throw new Error("Snapshot contains invalid or duplicate domains.");
  const writes=snapshotValue.records.map(row=>{
   if(!row||!domains.includes(row.domain)||!validKey(row.key))
    throw new Error("Snapshot record is outside its declared domains or has an invalid key.");
   return {id:recordId(row.domain,row.key),domain:row.domain,key:row.key,raw:validateValue(row.value)};
  });
  const ids=new Set();
  for(const row of writes){if(ids.has(row.id))throw new Error("Duplicate key in snapshot: "+row.id);ids.add(row.id);}
  const db=await open();
  try{
   const tx=db.transaction([STORE],"readwrite"),done=txDone(tx),store=tx.objectStore(STORE);
   const existing=await requestResult(store.getAll());
   for(const row of existing){if(domains.includes(row.domain))store.delete(row.id);}
   const stamp=new Date().toISOString();
   for(const row of writes)store.put({...row,updatedAt:stamp,byteLength:new Blob([row.raw]).size});
   await done;
   const verify=db.transaction([STORE],"readonly"),verifyDone=txDone(verify);
   const saved=await requestResult(verify.objectStore(STORE).getAll());
   await verifyDone;
   const actual=saved.filter(row=>domains.includes(row.domain)).sort((a,b)=>a.id.localeCompare(b.id));
   const expected=writes.slice().sort((a,b)=>a.id.localeCompare(b.id));
   if(actual.length!==expected.length||actual.some((row,i)=>row.id!==expected[i].id||row.raw!==expected[i].raw))
    throw new Error("Snapshot restore verification failed; restored domain contents do not match snapshot.");
   return {ok:true,written:writes.length,domains:domains.slice(),updatedAt:stamp,emptySnapshot:writes.length===0};
  }finally{db.close();}
 }
 async function health(){
  const db=await open();
  try{
   const tx=db.transaction([STORE,META],"readonly"),done=txDone(tx);
   const [rows,meta]=await Promise.all([
    requestResult(tx.objectStore(STORE).getAll()),
    requestResult(tx.objectStore(META).get(SCHEMA_KEY))
   ]);
   await done;
   const counts={};for(const row of rows)counts[row.domain]=(counts[row.domain]||0)+1;
   return {ok:true,database:DB_NAME,schemaVersion:DB_VERSION,appDataSchemaVersion:meta?meta.version:null,
    totalRecords:rows.length,counts};
  }finally{db.close();}
 }
 async function selfTest(){
  const runToken=Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);
  const domain="test_"+runToken,otherDomain="other_"+runToken,key="roundtrip";
  const reserved=[{domain,key},{domain,key:"batch-a"},{domain,key:"batch-b"},{domain,key:"concurrent-a"},{domain,key:"concurrent-b"},{domain,key:"stale-record"},{domain,key:"domain-accounting"},{domain,key:"domain-projects"},{domain,key:"abort-a"},{domain,key:"abort-b"},{domain,key:"invoice-counter"},{domain,key:"invoice-ledger"},{domain:otherDomain,key:"keep"},{domain:otherDomain,key:"domain-contracts"}];
  for(const item of reserved){
   if(await get(item.domain,item.key)!==null)
    throw new Error("Generated self-test namespace is unexpectedly occupied ("+recordId(item.domain,item.key)+"); refusing to overwrite existing data.");
  }
  const fixture={zero:0,blank:"",nil:null,flag:false,nested:[{id:"a",unknown:{keep:true}},[1,null,"x"]]};
  const checks={ready:false,roundTrip:false,atomicBatch:false,atomicMultiDomainMutation:false,abortRollback:false,concurrentWrites:false,concurrentCounterReservation:false,snapshotRestore:false,restoreRemovesStaleRecords:false,restorePreservesOtherDomains:false,emptySnapshotRestore:false,cleanup:false};
  try{
   await ready();checks.ready=true;
   await put(domain,key,fixture);
   const loaded=await get(domain,key);
   checks.roundTrip=canonical(loaded)===canonical(fixture);
   if(!checks.roundTrip)throw new Error("Round-trip test failed.");
   const batch=[{domain,key:"batch-a",value:{v:1}},{domain,key:"batch-b",value:{v:2}}];
   const result=await transact(batch);
   checks.atomicBatch=result.ok&&canonical(await get(domain,"batch-a"))===canonical({v:1})&&canonical(await get(domain,"batch-b"))===canonical({v:2});
   if(!checks.atomicBatch)throw new Error("Atomic batch test failed.");
   const descriptors=[{domain,key:"domain-accounting",initialValue:{entries:[]}},{domain,key:"domain-projects",initialValue:{projects:[]}},{domain:otherDomain,key:"domain-contracts",initialValue:[]}];
   const multi=await mutateMany(descriptors,current=>[
    {...current[0].value,entries:[...(current[0].value.entries||[]),{id:"e1",amount:10}]},
    {...current[1].value,projects:[...(current[1].value.projects||[]),{id:"p1"}]},
    [...current[2].value,{id:"c1"}]
   ]);
   const consistent=await readMany(descriptors);
   checks.atomicMultiDomainMutation=multi.ok&&consistent.ok&&canonical(consistent.records[0].value)===canonical({entries:[{id:"e1",amount:10}]})&&
    canonical(consistent.records[1].value)===canonical({projects:[{id:"p1"}]})&&canonical(consistent.records[2].value)===canonical([{id:"c1"}]);
   if(!checks.atomicMultiDomainMutation)throw new Error("Atomic multi-domain mutation failed.");
   await put(domain,"abort-a",{before:"A"});await put(domain,"abort-b",{before:"B"});
   let mutationAborted=false;
   try{await mutateMany([{domain,key:"abort-a"},{domain,key:"abort-b"}],()=>{throw new Error("Injected multi-record validation failure.");})}
   catch(error){mutationAborted=error.message==="Injected multi-record validation failure.";}
   const abortDb=await open();
   try{
    const stamp=new Date().toISOString();
    const abortTx=abortDb.transaction([STORE],"readwrite"),abortDone=txDone(abortTx),abortStore=abortTx.objectStore(STORE);
    abortStore.put({id:recordId(domain,"abort-a"),domain,key:"abort-a",raw:validateValue({after:"A"}),updatedAt:stamp,byteLength:1});
    abortStore.put({id:recordId(domain,"abort-b"),domain,key:"abort-b",raw:validateValue({after:"B"}),updatedAt:stamp,byteLength:1});
    abortTx.abort();
    try{await abortDone;throw new Error("Deliberate abort unexpectedly committed.")}catch(error){
     if(error&&error.message==="Deliberate abort unexpectedly committed.")throw error;
    }
   }finally{abortDb.close();}
   checks.abortRollback=mutationAborted&&canonical(await get(domain,"abort-a"))===canonical({before:"A"})&&canonical(await get(domain,"abort-b"))===canonical({before:"B"});
   if(!checks.abortRollback)throw new Error("Aborted transaction changed stored records.");
   await Promise.all([
    put(domain,"concurrent-a",{writer:"A",value:1}),
    put(domain,"concurrent-b",{writer:"B",value:2})
   ]);
   checks.concurrentWrites=canonical(await get(domain,"concurrent-a"))===canonical({writer:"A",value:1})&&
    canonical(await get(domain,"concurrent-b"))===canonical({writer:"B",value:2});
   if(!checks.concurrentWrites)throw new Error("Concurrent independent writes test failed.");
   const reservations=await Promise.all(Array.from({length:8},()=>mutateMany([
    {domain,key:"invoice-counter",initialValue:0},
    {domain,key:"invoice-ledger",initialValue:{invoices:[],entries:[]}}
   ],current=>{
    const sequence=Number(current[0].value)||0,ledger=current[1].value;
    const used=[...(ledger.invoices||[]),...(ledger.entries||[])].map(x=>Number(x.number)||0);
    const number=Math.max(sequence,...used)+1;
    return [number,{...ledger,invoices:[...(ledger.invoices||[]),{id:"test-invoice-"+number,number}]}];
   })));
   const counterValues=reservations.map(x=>x.records[0].value).sort((a,b)=>a-b);
   const finalCounter=await get(domain,"invoice-counter"),finalLedger=await get(domain,"invoice-ledger");
   checks.concurrentCounterReservation=counterValues.length===8&&new Set(counterValues).size===8&&counterValues.every((v,i)=>v===i+1)&&finalCounter===8&&finalLedger.invoices.length===8&&new Set(finalLedger.invoices.map(x=>x.number)).size===8;
   if(!checks.concurrentCounterReservation)throw new Error("Concurrent multi-record invoice reservation produced duplicate, non-monotonic, or incorrectly persisted numbers.");
   await remove(domain,"invoice-counter");await remove(domain,"invoice-ledger");
   await remove(domain,"concurrent-a");await remove(domain,"concurrent-b");
   await put(otherDomain,"keep",{untouched:true});
   const snap=await snapshot([domain]);
   await put(domain,"stale-record",{mustBeRemoved:true});
   const restoreResult=await restore(snap);
   checks.snapshotRestore=restoreResult.ok&&canonical(await get(domain,key))===canonical(fixture);
   if(!checks.snapshotRestore)throw new Error("Snapshot restore test failed.");
   checks.restoreRemovesStaleRecords=(await get(domain,"stale-record"))===null;
   if(!checks.restoreRemovesStaleRecords)throw new Error("Restore did not remove stale records in declared domain.");
   checks.restorePreservesOtherDomains=canonical(await get(otherDomain,"keep"))===canonical({untouched:true});
   if(!checks.restorePreservesOtherDomains)throw new Error("Restore modified a record outside declared domains.");
   const emptyRestore=await restore({format:"tha-idb-repository-snapshot-v1",database:DB_NAME,domains:[domain],records:[]});
   checks.emptySnapshotRestore=emptyRestore.ok&&emptyRestore.written===0&&emptyRestore.emptySnapshot===true&&(await get(domain,key))===null;
   if(!checks.emptySnapshotRestore)throw new Error("Empty snapshot restore did not clear its declared domain.");
   await remove(domain,key);await remove(domain,"batch-a");await remove(domain,"batch-b");
   await remove(domain,"domain-accounting");await remove(domain,"domain-projects");await remove(otherDomain,"domain-contracts");
   await remove(domain,"abort-a");await remove(domain,"abort-b");
   await remove(otherDomain,"keep");
   checks.cleanup=(await get(domain,key))===null&&(await get(domain,"batch-a"))===null&&(await get(domain,"batch-b"))===null&&(await get(domain,"concurrent-a"))===null&&(await get(domain,"concurrent-b"))===null&&(await get(domain,"stale-record"))===null&&(await get(domain,"domain-accounting"))===null&&(await get(domain,"domain-projects"))===null&&(await get(domain,"abort-a"))===null&&(await get(domain,"abort-b"))===null&&(await get(domain,"invoice-counter"))===null&&(await get(domain,"invoice-ledger"))===null&&(await get(otherDomain,"keep"))===null&&(await get(otherDomain,"domain-contracts"))===null;
   if(!checks.cleanup)throw new Error("Self-test cleanup failed.");
   const missingChecks=EXPECTED_CHECKS.filter(name=>checks[name]!==true);
   return {ok:missingChecks.length===0,database:DB_NAME,schemaVersion:DB_VERSION,selfTestBuild:SELF_TEST_BUILD,expectedChecks:EXPECTED_CHECKS.slice(),checks,missingChecks,localStorageAccessed:false,appCutover:false};
  }catch(error){
   // Do not silently delete partial test evidence if a check fails.
   return {ok:false,database:DB_NAME,schemaVersion:DB_VERSION,selfTestBuild:SELF_TEST_BUILD,expectedChecks:EXPECTED_CHECKS.slice(),checks,missingChecks:EXPECTED_CHECKS.filter(name=>checks[name]!==true),error:String(error&&error.message||error),cleanupAttempted:false,appCutover:false};
  }
 }
 root.HandymanStorageRepository=Object.freeze({databaseName:DB_NAME,schemaVersion:DB_VERSION,selfTestBuild:SELF_TEST_BUILD,expectedChecks:EXPECTED_CHECKS.slice(),ready,get,readMany,put,remove,transact,mutate,mutateMany,reserveCounter,snapshot,restore,health,selfTest});
})(window);
