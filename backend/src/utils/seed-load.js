/**
 * Load-test seed — generates high-volume data to stress-test the system.
 *
 * Targets:
 *   Users:    1,000  (mix of accountant/viewer)
 *   Vendors:     50
 *   POs:      2,000  (~40 per vendor)
 *   Invoices: 5,000  (spread across all 6 statuses)
 *
 * Strategy: insertMany in batches of 500 — avoids individual round-trips.
 * PDFs: generates 10 reusable template files and rotates through them.
 * Run time target: < 2 minutes on a local machine.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const fs       = require('fs');
const crypto   = require('crypto');
const PDFDocument = require('pdfkit');
const bcrypt      = require('bcryptjs');

const User          = require('../models/User');
const Vendor        = require('../models/Vendor');
const PurchaseOrder = require('../models/PurchaseOrder');
const Invoice       = require('../models/Invoice');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── Config ──────────────────────────────────────────────────────────────────
const TARGET_USERS    = 1000;
const TARGET_VENDORS  =   50;
const TARGET_POS      = 2000;
const TARGET_INVOICES = 5000;
const BATCH_SIZE      =  500;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const rand    = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick    = arr => arr[Math.floor(Math.random() * arr.length)];
const fmtTime = ms => ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;

function writePDF(filepath, vendorName, invNum, total, currency) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, left: 72, right: 72, bottom: 50 } });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);
    doc.fontSize(20).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').text(`Vendor: ${vendorName}`);
    doc.text(`Invoice Number: ${invNum}`);
    doc.text(`Total Amount: ${currency === 'INR' ? '₹' : '$'}${total.toFixed(2)}`);
    doc.text(`Currency: ${currency}`);
    doc.text(`Date: ${new Date().toLocaleDateString()}`);
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function insertBatches(Model, docs, label) {
  let inserted = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    await Model.insertMany(batch, { ordered: false });
    inserted += batch.length;
    process.stdout.write(`\r  ${label}: ${inserted}/${docs.length}`);
  }
  console.log(`\r  ${label}: ${docs.length}/${docs.length} ✓`);
}

// ─── Data pools ──────────────────────────────────────────────────────────────
const VENDOR_NAMES = [
  'Acme Supplies','TechCorp Solutions','Global Services','Apex Industries','Zenith Trading',
  'Vertex Systems','Pinnacle Logistics','Summit Materials','Horizon Consulting','Catalyst Corp',
  'Delta Dynamics','Echo Enterprises','Frontier Tech','Granite Group','Harbor Holdings',
  'Infinite Solutions','Jade Technologies','Keystone Partners','Luminary Labs','Matrix Mfg',
  'Nexus Networks','Orbit Operations','Prism Partners','Quantum Qommerce','Rapid Resources',
  'Stellar Supplies','Titan Technologies','Unity Unlimited','Venture Dynamics','Wavelength Works',
  'Axon Analytics','Blue Ridge Supply','Coastal Commerce','Dusk Digital','Ember Electronics',
  'Falcon Fabrication','Gemstone Global','Harbor Hardware','Icon Industries','Junction Logistics',
  'Kestrel Commerce','Lantern Labs','Meridian Manufacturing','Nova Networks','Obsidian Operations',
  'Pacific Partners','Quartz Quality','Riverstone Resources','Solaris Systems','Thornfield Trading'
];

const PO_ITEM_POOLS = [
  [{ description: 'Office Chair Ergonomic', unitPrice: 1200 }, { description: 'Standing Desk', unitPrice: 1500 }, { description: 'Monitor 27 inch', unitPrice: 900 }],
  [{ description: 'Laptop Pro 15', unitPrice: 8500 }, { description: 'Wireless Mouse', unitPrice: 80 }, { description: 'Laptop Stand', unitPrice: 150 }],
  [{ description: 'Server Rack Unit', unitPrice: 4500 }, { description: 'Network Switch 24p', unitPrice: 1800 }, { description: 'UPS 1500VA', unitPrice: 650 }],
  [{ description: 'Cloud Storage 1TB Annual', unitPrice: 240 }, { description: 'Software License Annual', unitPrice: 600 }, { description: 'Support Plan Premium', unitPrice: 1200 }],
  [{ description: 'Printer LaserJet', unitPrice: 2200 }, { description: 'Paper Ream A4 x50', unitPrice: 220 }, { description: 'Ink Cartridge Set', unitPrice: 180 }],
  [{ description: 'Security Camera System', unitPrice: 3500 }, { description: 'Access Control Unit', unitPrice: 2800 }, { description: 'Installation Service', unitPrice: 1500 }],
  [{ description: 'Consulting Hours x20', unitPrice: 150 }, { description: 'Project Management Fee', unitPrice: 5000 }, { description: 'Documentation Package', unitPrice: 800 }],
  [{ description: 'Raw Material Batch A', unitPrice: 12000 }, { description: 'Raw Material Batch B', unitPrice: 8500 }, { description: 'Processing Fee', unitPrice: 1200 }],
];

const INVOICE_STATUSES = ['uploaded','ocr_extracted','pending_review','passed','review_required','rejected'];
const STATUS_WEIGHTS   = [0.10,       0.15,          0.20,            0.30,    0.18,             0.07];

function weightedStatus() {
  const r = Math.random();
  let cum = 0;
  for (let i = 0; i < INVOICE_STATUSES.length; i++) {
    cum += STATUS_WEIGHTS[i];
    if (r < cum) return INVOICE_STATUSES[i];
  }
  return 'passed';
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function seed() {
  const t0 = Date.now();
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/invoice-automation');
  console.log('Connected to MongoDB');

  // Wipe
  await Promise.all([User.deleteMany({}), Vendor.deleteMany({}), PurchaseOrder.deleteMany({}), Invoice.deleteMany({})]);
  console.log('Wiped existing data\n');

  // ── Fixed admin user ──────────────────────────────────────────────────────
  const pwHash = await bcrypt.hash('admin123', 10);
  const acctHash = await bcrypt.hash('accountant123', 10);
  const viewHash = await bcrypt.hash('viewer123', 10);

  const admin = await User.create({ name: 'Admin User', email: 'admin@company.com', password: 'admin123', role: 'admin' });
  await User.create({ name: 'Asha Accountant', email: 'accountant@company.com', password: 'accountant123', role: 'accountant' });
  await User.create({ name: 'Victor Viewer',   email: 'viewer@company.com',     password: 'viewer123',      role: 'viewer'     });

  // ── Bulk users ────────────────────────────────────────────────────────────
  const t1 = Date.now();
  console.log(`Generating ${TARGET_USERS} users…`);
  const userDocs = [];
  for (let i = 1; i <= TARGET_USERS; i++) {
    const role = i % 5 === 0 ? 'viewer' : 'accountant';
    const hash = role === 'viewer' ? viewHash : acctHash;
    userDocs.push({
      name:     `${role === 'accountant' ? 'Accountant' : 'Viewer'} User ${i}`,
      email:    `${role}${i}@company.com`,
      password: hash,
      role,
      createdAt: new Date(Date.now() - rand(0, 365) * 86400000)
    });
  }
  await insertBatches(User, userDocs, 'Users');
  console.log(`  Done in ${fmtTime(Date.now() - t1)}\n`);

  // ── Vendors ───────────────────────────────────────────────────────────────
  const t2 = Date.now();
  console.log(`Generating ${TARGET_VENDORS} vendors…`);
  const currencies = ['USD', 'USD', 'USD', 'INR', 'EUR'];
  const vendorDocs = VENDOR_NAMES.slice(0, TARGET_VENDORS).map((name, i) => ({
    name,
    email: `billing@${name.toLowerCase().replace(/\s+/g,'-')}.com`,
    phone: `+1-555-${String(i).padStart(3,'0')}-${String(rand(1000,9999))}`,
    taxId: `EIN-${rand(10,99)}-${rand(1000000,9999999)}`,
    registrationNumber: `REG-${String(i).padStart(5,'0')}`,
    paymentTerms: pick(['Net 15','Net 30','Net 45','Net 60']),
    status: i < 45 ? 'active' : 'inactive',
    address: { street: `${rand(1,999)} Main St`, city: pick(['New York','Chicago','Austin','Mumbai','London']), state: pick(['NY','TX','CA','MH','']), country: pick(['USA','USA','USA','India','UK']), zipCode: String(rand(10000,99999)) },
    preferredCurrency: pick(currencies),
    requiredFields: [
      { fieldKey: 'vendorName',    fieldLabel: 'Vendor Name'    },
      { fieldKey: 'invoiceNumber', fieldLabel: 'Invoice Number' },
      { fieldKey: 'totalAmount',   fieldLabel: 'Total Amount'   },
      { fieldKey: 'invoiceDate',   fieldLabel: 'Invoice Date'   },
      { fieldKey: 'poNumber',      fieldLabel: 'PO Number'      }
    ]
  }));
  await insertBatches(Vendor, vendorDocs, 'Vendors');
  const vendors = await Vendor.find({}, '_id preferredCurrency').lean();
  console.log(`  Done in ${fmtTime(Date.now() - t2)}\n`);

  // ── Purchase Orders ───────────────────────────────────────────────────────
  const t3 = Date.now();
  console.log(`Generating ${TARGET_POS} purchase orders…`);
  const poStatuses = ['draft','approved','approved','approved','closed'];
  const poDocs = [];
  for (let i = 1; i <= TARGET_POS; i++) {
    const vendor  = vendors[(i - 1) % vendors.length];
    const currency = vendor.preferredCurrency || 'USD';
    const itemPool = PO_ITEM_POOLS[i % PO_ITEM_POOLS.length];
    const qty      = rand(1, 20);
    const lineItems = itemPool.map(item => {
      const q = rand(1, qty);
      const tp = +(q * item.unitPrice).toFixed(2);
      return { description: item.description, quantity: q, unitPrice: item.unitPrice, totalPrice: tp };
    });
    const subTotal = +lineItems.reduce((s, l) => s + l.totalPrice, 0).toFixed(2);
    const taxRate  = currency === 'INR' ? 18 : pick([0, 0, 8.5, 10]);
    const tax      = +(subTotal * taxRate / 100).toFixed(2);
    poDocs.push({
      vendor:   vendor._id,
      poNumber: `PO-${String(i).padStart(5,'0')}`,
      currency,
      status:   pick(poStatuses),
      createdBy: admin._id,
      issueDate: new Date(Date.now() - rand(30, 365) * 86400000),
      expectedDelivery: new Date(Date.now() + rand(1, 60) * 86400000),
      lineItems,
      subTotal,
      taxRate,
      tax,
      totalAmount: +(subTotal + tax).toFixed(2),
      notes: `Auto-generated PO #${i} for load testing`
    });
  }
  await insertBatches(PurchaseOrder, poDocs, 'POs');
  const pos = await PurchaseOrder.find({}, '_id vendor currency totalAmount status').lean();
  const approvedPos = pos.filter(p => p.status === 'approved');
  console.log(`  Done in ${fmtTime(Date.now() - t3)}\n`);

  // ── PDF templates (10 reusable files) ────────────────────────────────────
  console.log('Generating 10 PDF templates…');
  const templateFiles = [];
  const sampleVendors = VENDOR_NAMES.slice(0, 10);
  for (let i = 0; i < 10; i++) {
    const fname = `load-template-${i}-${Date.now()}.pdf`;
    const fpath = path.join(UPLOADS_DIR, fname);
    await writePDF(fpath, sampleVendors[i], `INV-TEMPLATE-00${i}`, rand(1000, 50000), pick(['USD','USD','INR']));
    templateFiles.push({ fname, fpath, size: fs.statSync(fpath).size, hash: crypto.createHash('sha256').update(fs.readFileSync(fpath)).digest('hex') });
  }
  console.log('  10 templates ready\n');

  // ── Invoices ──────────────────────────────────────────────────────────────
  const t4 = Date.now();
  console.log(`Generating ${TARGET_INVOICES} invoices…`);

  // Pre-fetch a sample of user IDs for createdBy
  const userIds = (await User.find({}, '_id').lean()).map(u => u._id);

  const allInvoiceDocs = [];
  for (let i = 1; i <= TARGET_INVOICES; i++) {
    const status   = weightedStatus();
    const tpl      = templateFiles[i % templateFiles.length];
    const po       = approvedPos.length ? approvedPos[i % approvedPos.length] : null;
    const currency = po?.currency || pick(['USD','USD','INR']);
    const baseAmt  = po?.totalAmount || rand(500, 50000);
    // Introduce realistic variance: passed invoices match PO, others may differ
    const totalAmount = status === 'passed'        ? baseAmt
                      : status === 'review_required' ? +(baseAmt * (1 + rand(6,30)/100)).toFixed(2)
                      : +(baseAmt * (1 + rand(-2,2)/100)).toFixed(2);
    const subTotal    = +(totalAmount * 0.85).toFixed(2);
    const tax         = +(totalAmount - subTotal).toFixed(2);
    const invNum      = `INV-LOAD-${String(i).padStart(6,'0')}`;
    const createdBy   = userIds[i % userIds.length];
    const daysAgo     = rand(1, 180);
    const anomalyScore = status === 'passed'         ? +(Math.random() * 0.25).toFixed(2)
                       : status === 'review_required' ? +(0.5 + Math.random() * 0.5).toFixed(2)
                       : status === 'rejected'        ? +(0.7 + Math.random() * 0.3).toFixed(2)
                       : +(Math.random() * 0.5).toFixed(2);
    const riskLevel   = anomalyScore < 0.3 ? 'low' : anomalyScore < 0.6 ? 'medium' : 'high';

    const extractedData = {
      vendorName:    { value: VENDOR_NAMES[i % VENDOR_NAMES.length], confidence: rand(65, 97) },
      invoiceNumber: { value: invNum,     confidence: rand(85, 98) },
      poNumber:      { value: po ? `PO-${String((i % approvedPos.length) + 1).padStart(5,'0')}` : null, confidence: po ? rand(80,95) : 0 },
      invoiceDate:   { value: new Date(Date.now() - daysAgo * 86400000).toLocaleDateString(), confidence: rand(70, 95) },
      currency:      { value: currency,   confidence: rand(80, 97) },
      totalAmount:   { value: totalAmount, confidence: rand(80, 95) },
      subTotal:      { value: subTotal,    confidence: rand(75, 92) },
      tax:           { value: tax,         confidence: rand(70, 90) },
      gstNumber:     { value: currency === 'INR' ? `${rand(10,35)}AABCA1234A1Z5` : null, confidence: currency === 'INR' ? rand(88,97) : 0 },
      dueDate:       { value: null, confidence: 0 },
      bankAccount:   { value: null, confidence: 0 },
      lineItems: [{
        description: PO_ITEM_POOLS[i % PO_ITEM_POOLS.length][0].description,
        quantity: rand(1,10), unitPrice: rand(100,5000), totalPrice: totalAmount, confidence: rand(65,85)
      }],
      overallConfidence: rand(65, 95),
      extractedFieldCount: rand(5, 8),
      totalFields: 8
    };

    const processingLog = [{ action: 'Invoice Uploaded', details: `File: ${tpl.fname}`, status: 'info', timestamp: new Date(Date.now() - daysAgo * 86400000) }];
    if (['ocr_extracted','pending_review','passed','review_required','rejected'].includes(status)) {
      processingLog.push({ action: 'OCR Complete', details: `Fields: ${extractedData.extractedFieldCount}/8. Confidence: ${extractedData.overallConfidence}%`, status: 'success', timestamp: new Date(Date.now() - (daysAgo - 1) * 86400000) });
    }
    if (['pending_review','passed','review_required','rejected'].includes(status)) {
      processingLog.push({ action: 'Fields Saved', details: `${rand(4,7)} field(s) verified`, status: 'info', timestamp: new Date(Date.now() - (daysAgo - 2) * 86400000) });
    }
    if (['passed','review_required','rejected'].includes(status)) {
      const score = status === 'passed' ? rand(75,100) : rand(20,59);
      processingLog.push({ action: 'Matching Complete', details: `Score: ${score}% | Status: ${status}`, status: status === 'passed' ? 'success' : 'error', timestamp: new Date(Date.now() - (daysAgo - 3) * 86400000) });
    }
    if (status === 'rejected') {
      processingLog.push({ action: 'Invoice Rejected', details: 'Rejected: significant discrepancies detected', status: 'error' });
    }

    const matchScore = status === 'passed'          ? rand(75, 100)
                     : status === 'review_required'  ? rand(20, 59)
                     : status === 'rejected'         ? rand(0, 40)
                     : 0;

    const discrepancies = (status === 'review_required' || status === 'rejected') ? [
      { field: 'totalAmount', expected: baseAmt, actual: totalAmount, severity: 'high' }
    ] : [];

    allInvoiceDocs.push({
      status,
      vendor:        po?.vendor || vendors[i % vendors.length]._id,
      purchaseOrder: ['passed','review_required','pending_review'].includes(status) && po ? po._id : undefined,
      invoiceNumber: invNum,
      uploadedFile: {
        filename:     tpl.fname,
        originalName: `Invoice-${invNum}.pdf`,
        mimetype:     'application/pdf',
        path:         `uploads/${tpl.fname}`,
        size:         tpl.size,
        hash:         crypto.createHash('sha256').update(invNum).digest('hex') // unique per invoice
      },
      ocrText: ['ocr_extracted','pending_review','passed','review_required','rejected'].includes(status)
        ? `INVOICE\nVendor: ${VENDOR_NAMES[i % VENDOR_NAMES.length]}\nInvoice Number: ${invNum}\nTotal Amount: ${totalAmount}\nCurrency: ${currency}` : '',
      extractedData: ['uploaded'].includes(status) ? { lineItems: [], overallConfidence: 0, extractedFieldCount: 0, totalFields: 8 } : extractedData,
      userVerifiedData: ['pending_review','passed','review_required','rejected'].includes(status) ? {
        vendorName: VENDOR_NAMES[i % VENDOR_NAMES.length],
        invoiceNumber: invNum,
        totalAmount,
        currency
      } : undefined,
      validationResult: {
        status:     ['passed','review_required','rejected'].includes(status) ? status : 'pending',
        matchScore,
        discrepancies,
        duplicateCheck: { isDuplicate: false }
      },
      anomalyScore,
      riskLevel,
      processingLog,
      createdBy,
      createdAt: new Date(Date.now() - daysAgo * 86400000),
      updatedAt: new Date(Date.now() - Math.max(0, daysAgo - 3) * 86400000)
    });
  }

  await insertBatches(Invoice, allInvoiceDocs, 'Invoices');
  console.log(`  Done in ${fmtTime(Date.now() - t4)}\n`);

  // ── Summary counts ────────────────────────────────────────────────────────
  const [uCount, vCount, poCount, invCount] = await Promise.all([
    User.countDocuments(), Vendor.countDocuments(), PurchaseOrder.countDocuments(), Invoice.countDocuments()
  ]);
  const statusCounts = await Invoice.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const riskCounts   = await Invoice.aggregate([{ $group: { _id: '$riskLevel', count: { $sum: 1 } } }]);

  const totalTime = fmtTime(Date.now() - t0);
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                   LOAD TEST DATA READY                          ║
╠══════════════════════════════════════════════════════════════════╣
║  Seed time:  ${totalTime.padEnd(50)} ║
╠══════════════════════════════════════════════════════════════════╣
║  Users:      ${String(uCount).padEnd(50)} ║
║  Vendors:    ${String(vCount).padEnd(50)} ║
║  POs:        ${String(poCount).padEnd(50)} ║
║  Invoices:   ${String(invCount).padEnd(50)} ║
╠══════════════════════════════════════════════════════════════════╣
║  Invoice breakdown by status:                                   ║`);
  statusCounts.forEach(s => console.log(`║    ${(s._id + ':').padEnd(20)} ${String(s.count).padEnd(34)} ║`));
  console.log(`╠══════════════════════════════════════════════════════════════════╣
║  Invoice breakdown by risk:                                     ║`);
  riskCounts.forEach(r => console.log(`║    ${((r._id || 'unknown') + ':').padEnd(20)} ${String(r.count).padEnd(34)} ║`));
  console.log(`╠══════════════════════════════════════════════════════════════════╣
║  Admin login: admin@company.com / admin123                      ║
╚══════════════════════════════════════════════════════════════════╝
`);

  await mongoose.disconnect();
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
