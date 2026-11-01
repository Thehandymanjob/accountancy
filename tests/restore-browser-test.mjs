import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const html = await readFile(resolve('index.html'));
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on('dialog', dialog => dialog.accept());
  await page.goto('http://127.0.0.1:4173');
  const existingAccounting = {
    entries: [{ id: 'device-entry', amount: 55 }],
    customers: [{ id: 'device-customer', name: 'Device customer' }],
    invoices: [],
    settings: { businessName: 'Device business' }
  };
  const existingProjects = {
    projects: [],
    workers: [],
    profile: {},
    companies: [{ id: 'shared-company', name: 'Device company version' }, { id: 'device-company', name: 'Device only company' }],
    companyJobs: [{ id: 'shared-job', name: 'Device job version' }, { id: 'device-job', name: 'Device only job' }]
  };
  await page.evaluate(({ accounting, projects }) => {
    localStorage.setItem('tha_v206_accounting_v1', JSON.stringify(accounting));
    localStorage.setItem('tha_v206_projects_v1', JSON.stringify(projects));
    localStorage.setItem('tha_v206_contracts_v1', JSON.stringify([{ id: 'device-contract' }]));
  }, { accounting: existingAccounting, projects: existingProjects });
  await page.reload();

  const backup = {
    app: 'The Handyman Accountancy',
    backupType: 'complete-user-data',
    version: 6,
    data: {
      entries: [{ id: 'backup-entry', amount: 120 }],
      customers: [{ id: 'customer-magawell', name: 'Magawell Ltd' }],
      invoices: [{ id: 'backup-invoice' }],
      settings: { businessName: 'Backup business' },
      customExpenseCategories: [{ id: 'cat-1', name: 'Custom category' }],
      thirdPartyTransactions: []
    },
    projects: {
      projects: [{
        id: 'ruthin-garden',
        name: '29 Ruthin Garden',
        customer: 'Monir',
        photo: 'data:image/jpeg;base64,' + 'P'.repeat(389459),
        price: 10500,
        subprojects: [
          { id: 'roof', price: 6000, income: [{ id: 'r1', amount: 2000, method: 'Cash', date: '' }, { id: 'r2', amount: 2000, method: 'Bank transfer', date: '' }, { id: 'r3', amount: 300, receiptType: 'extra-work', date: '2026-10-16' }] },
          { id: 'top-floor', price: 4500, income: [{ id: 'r4', amount: 1000, method: 'Cash', date: '' }] },
          { id: 'porch-roof', price: 1000, income: [{ id: 'r5', amount: 700, method: 'Cash', date: '' }] },
          { id: 'plumbing', price: 200, income: [{ id: 'r6', amount: 200, method: 'Cash', date: '2026-10-21' }] }
        ]
      }],
      workers: [{ id: 'backup-worker', name: 'Worker' }],
      partners: [{ id: 'backup-partner', name: 'Partner' }],
      contractors: [{ id: 'backup-contractor', name: 'Contractor' }],
      profile: { businessName: 'Backup profile', logo: 'data:image/png;base64,' + 'L'.repeat(383911) },
      companies: [
        { id: 'shared-company', name: 'Backup company version' },
        { id: 'backup-company', name: 'B&q' }
      ],
      companyJobs: [
        { id: 'shared-job', name: 'Backup job version' },
        { id: 'backup-job', name: 'Backup job' }
      ]
    },
    contracts: [{ id: 'ct-1792309475242-xnqzq', title: 'Bathroom', customer: 'Monir', body: 'Customer Name: John Smith\\nProject Address: 25 Example Street\\nContract Reference: TEST-001\\nThis is a sample contract for software testing.' }]
  };

  await page.locator('#restoreFile').setInputFiles({
    name: 'synthetic-complete-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup))
  });

  const result = await page.evaluate(() => ({
    accounting: JSON.parse(localStorage.getItem('tha_v206_accounting_v1')),
    projects: JSON.parse(localStorage.getItem('tha_v206_projects_v1')),
    contracts: JSON.parse(localStorage.getItem('tha_v206_contracts_v1')),
    recovery: localStorage.getItem('tha_v206_restore_recovery_v1')
  }));

  const project = result.projects.projects.find(p => p.id === 'ruthin-garden');
  const byId = (items, id) => items.find(item => item.id === id);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };

  assert(result.accounting.entries[0].id === 'backup-entry', 'Accounting backup entries were not restored');
  assert(result.accounting.customers[0].id === 'customer-magawell' && result.accounting.customers[0].name === 'Magawell Ltd', 'Actual backup customer was not restored');
  assert(result.accounting.customExpenseCategories[0].id === 'cat-1', 'Custom expense categories were not restored');
  assert(Array.isArray(result.accounting.thirdPartyTransactions), 'Third-party transaction data was not preserved');
  assert(result.contracts[0].id === 'ct-1792309475242-xnqzq', 'Backup contract was not restored');
  assert(result.contracts[0].customer === 'Monir' && result.contracts[0].body.includes('John Smith') && result.contracts[0].body.includes('TEST-001'), 'Inconsistent sample contract content was not preserved verbatim');
  assert(result.contracts[0].restoreReviewRequired === true && result.contracts[0].restoreReviewReason.includes('Verify customer name'), 'Sample contract was not flagged for review');
  assert(project?.price === 11700, 'Project agreed price should be £11,700; got ' + project?.price);
  assert(project.price !== 12000, 'Extra-work receipt was incorrectly included in agreed project price');
  assert(project.customer === 'Monir' && !Object.prototype.hasOwnProperty.call(project, 'customerId'), 'Project customer name was altered or an unsupported customer link was invented');
  const receipts = project.subprojects.flatMap(sub => sub.income || []);
  assert(receipts.filter(receipt => receipt.date === '').length === 4, 'Blank receipt dates were filled or changed');
  assert(receipts.find(receipt => receipt.id === 'r3')?.date === '2026-10-16', 'Dated extra-work receipt date changed');
  assert(receipts.find(receipt => receipt.id === 'r6')?.date === '2026-10-21', 'Dated plumbing receipt date changed');
  assert(project.photo?.length === 389459 + 'data:image/jpeg;base64,'.length, 'Project photo payload was not preserved');
  assert(result.projects.profile.logo?.length === 383911 + 'data:image/png;base64,'.length, 'Company logo payload was not preserved');
  assert(result.projects.workers.some(x => x.id === 'backup-worker'), 'Workers were not restored');
  assert(result.projects.partners.some(x => x.id === 'backup-partner'), 'Partners were not restored');
  assert(result.projects.contractors.some(x => x.id === 'backup-contractor'), 'Contractors were not restored');
  assert(byId(result.projects.companies, 'shared-company')?.name === 'Device company version', 'Existing company did not take precedence');
  assert(byId(result.projects.companies, 'device-company'), 'Device-only company was lost');
  assert(byId(result.projects.companies, 'backup-company')?.name === 'B&q', 'Backup company was not imported');
  assert(byId(result.projects.companyJobs, 'shared-job')?.name === 'Device job version', 'Existing company job did not take precedence');
  assert(byId(result.projects.companyJobs, 'device-job'), 'Device-only company job was lost');
  assert(byId(result.projects.companyJobs, 'backup-job'), 'Backup company job was not imported');
  assert(result.recovery === null, 'Temporary recovery snapshot should be cleared after successful restore');
  console.log('Browser restore test passed: backup customer, unresolved project-customer name preserved without invented link, blank receipt dates retained, sample contract preserved verbatim and flagged for review, registries, company merge, logo/photo payloads, and £11,700 project total.');

} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
