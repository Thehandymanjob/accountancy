import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const html = await readFile(resolve('index.html'));
const server = createServer((req, res) => { res.writeHead(200, {'content-type':'text/html; charset=utf-8'}); res.end(html); });
await new Promise(resolve => server.listen(4174, '127.0.0.1', resolve));
const browser = await chromium.launch({headless:true});
const backup = {
  app:'The Handyman Accountancy', backupType:'complete-user-data',
  data:{entries:[{id:'new-entry',amount:10}],customers:[],invoices:[],settings:{}},
  projects:{projects:[],workers:[],profile:{}}, contracts:[]
};
const seed = async page => {
  await page.goto('http://127.0.0.1:4174');
  await page.evaluate(() => {
    localStorage.setItem('tha_v206_accounting_v1', JSON.stringify({entries:[{id:'old-entry'}],customers:[],invoices:[],settings:{businessName:'OLD'}}));
    localStorage.setItem('tha_v206_projects_v1', JSON.stringify({projects:[],workers:[],profile:{businessName:'OLD PROFILE'}}));
    localStorage.setItem('tha_v206_contracts_v1', JSON.stringify([{id:'old-contract'}]));
  });
  await page.reload();
};
const readKeys = page => page.evaluate(() => ['tha_v206_accounting_v1','tha_v206_projects_v1','tha_v206_contracts_v1','tha_v206_restore_recovery_v1'].map(k=>localStorage.getItem(k)));
const assert = (ok,msg) => { if(!ok) throw new Error(msg); };
try {
  // Malformed JSON must be rejected before any persistent write.
  {
    const page = await browser.newPage();
    page.on('dialog', d => d.accept());
    await seed(page);
    const before = await readKeys(page);
    await page.locator('#restoreFile').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{not-json')});
    const after = await readKeys(page);
    assert(JSON.stringify(after)===JSON.stringify(before),'Malformed backup changed existing data');
    await page.close();
  }
  // A UI refresh exception occurs after writes; restore must roll all three keys back.
  {
    const page = await browser.newPage();
    page.on('dialog', d => d.accept());
    await seed(page);
    const before = await readKeys(page);
    await page.evaluate(() => { window.refreshAll = () => { throw new Error('SIMULATED_REFRESH_FAILURE'); }; });
    await page.locator('#restoreFile').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    const after = await readKeys(page);
    assert(after[0]===before[0] && after[1]===before[1] && after[2]===before[2],'Refresh failure did not restore original LocalStorage values');
    assert(after[3]===null,'Recovery snapshot was not cleared after verified rollback');
    await page.close();
  }
  // Failure while saving the recovery snapshot must not touch the original records.
  {
    const page = await browser.newPage();
    page.on('dialog', d => d.accept());
    await seed(page);
    const before = await readKeys(page);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key,value) {
        if (key==='tha_v206_restore_recovery_v1') throw new DOMException('Quota exceeded','QuotaExceededError');
        return original.call(this,key,value);
      };
    });
    await page.locator('#restoreFile').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    const after = await readKeys(page);
    assert(after[0]===before[0] && after[1]===before[1] && after[2]===before[2],'Recovery snapshot quota failure changed existing data');
    assert(after[3]===null,'Recovery key unexpectedly exists after snapshot quota failure');
    await page.close();
  }
  console.log('Restore failure tests passed: malformed JSON is non-destructive; UI refresh failure rolls back and verifies all three LocalStorage records; recovery-snapshot quota failure leaves existing data untouched.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
