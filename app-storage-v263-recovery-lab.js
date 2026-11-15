/* Lab-only adapter: points exclusively to tha_v263_recovery_lab_idb. */
(function(root){"use strict";
 const api=()=>root.HandymanStorageV263Lab;
 const domains=["accounting","projects","contracts","sequences","preferences","diagnostics","reports","notifications","recovery","lab_unknown_domain"];
 async function initialize(){return api().ready();}
 async function health(){return api().health();}
 root.HandymanAppStorageV263Lab=Object.freeze({domains,initialize,health});
})(window);