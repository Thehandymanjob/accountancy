/* THA v263 — shared Business Profile consumer bridge.
   This module is intentionally read-only for all consumers.
   It never accesses Projects, Accounting, Contracts, LocalStorage or any legacy key.
*/
(function(root){
 "use strict";
 const profile=()=>{const api=root.HandymanBusinessProfileV263;if(!api)throw new Error("Business Profile controller is unavailable.");return api;};
 async function readFor(consumer){
  const allowed=["launcher","contracts","invoices","accountingReports","projectReceipts","projectReports","exports"];
  if(!allowed.includes(consumer))throw new Error("Unknown Business Profile consumer: "+consumer);
  const p=await profile().load();
  return Object.freeze({
   consumer,
   businessName:p.businessName||"The Handyman",
   ownerName:p.ownerName||"",
   phone:p.phone||"",
   email:p.email||"",
   address:p.address||"",
   logo:p.logo||"",
   paymentDetails:p.paymentDetails||p.bankDetails||p.bankAccountDetails||""
  });
 }
 async function readMany(consumers){
  if(!Array.isArray(consumers)||!consumers.length)throw new Error("A non-empty consumer list is required.");
  const unique=[...new Set(consumers)];
  const rows=await Promise.all(unique.map(readFor));
  return rows;
 }
 root.HandymanBusinessProfileConsumersV263=Object.freeze({readFor,readMany});
})(window);
