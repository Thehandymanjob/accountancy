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
      customers: [{ id: 'backup-customer', name: 'Backup customer' }],
      invoices: [{ id: 'backup-invoice' }],
      settings: { businessName: 'Backup business' }
    },
    projects: {
      projects: [{
        id: 'ruthin-garden',
        name: '29 Ruthin Garden',
        price: 10500,
        subprojects: [
          { id: 'roof', price: 6000, income: [{ amount: 300, receiptType: 'extra-work' }] },
          { id: 'top-floor', price: 4500 },
          { id: 'porch-roof', price: 1000 },
          { id: 'plumbing', price: 200 }
        ]
      }],
      workers: [{ id: 'backup-worker', name: 'Worker' }],
      profile: { businessName: 'Backup profile' },
      companies: [
        { id: 'shared-company', name: 'Backup company version' },
        { id: 'backup-company', name: 'B&q' }
      ],
      companyJobs: [
        { id: 'shared-job', name: 'Backup job version' },
        { id: 'backup-job', name: 'Backup job' }
      ]
    },
    contracts: [{ id: 'backup-contract' }]
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
  assert(result.accounting.customers[0].id === 'backup-customer', 'Backup customers were not restored');
  assert(result.contracts[0].id === 'backup-contract', 'Backup contracts were not restored');
  assert(project?.price === 11700, 'Project agreed price should be £11,700; got ' + project?.price);
  assert(project.price !== 12000, 'Extra-work receipt was incorrectly included in agreed project price');
  assert(byId(result.projects.companies, 'shared-company')?.name === 'Device company version', 'Existing company did not take precedence');
  assert(byId(result.projects.companies, 'device-company'), 'Device-only company was lost');
  assert(byId(result.projects.companies, 'backup-company')?.name === 'B&q', 'Backup company was not imported');
  assert(byId(result.projects.companyJobs, 'shared-job')?.name === 'Device job version', 'Existing company job did not take precedence');
  assert(byId(result.projects.companyJobs, 'device-job'), 'Device-only company job was lost');
  assert(byId(result.projects.companyJobs, 'backup-job'), 'Backup company job was not imported');
  assert(result.recovery === null, 'Temporary recovery snapshot should be cleared after successful restore');
  console.log('Browser restore test passed: accounting/contracts replacement, company merge, existing-record precedence, and £11,700 project total.');

} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
