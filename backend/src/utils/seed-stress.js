/**
 * Stress-test seed — wipes all data and creates a comprehensive dataset
 * that exercises every feature and code path in the system:
 *
 *  Users:    3  (admin, accountant, viewer)
 *  Vendors:  3  (Acme/INR, TechCorp/USD, Global/USD)
 *  POs:      9  (3 per vendor — approved, closed, draft mixes)
 *  Invoices: 12 covering:
 *    • uploaded           ×2  (one normal, one that will become a duplicate)
 *    • ocr_extracted      ×2  (one clean, one with poor confidence)
 *    • pending_review     ×2  (ready to match, one with field corrections)
 *    • passed             ×2  (one perfect 100%, one with minor discrepancy that still cleared)
 *    • review_required    ×3  (amount overcharge, currency mismatch, no-PO-linked)
 *    • rejected           ×1
 *
 *  Extra scenarios tested:
 *    – Duplicate detection (inv-dup shares hash + invoice number with inv-upload-1)
 *    – No-PO path (review_required even though everything else matches)
 *    – Currency mismatch (INR invoice against USD PO)
 *    – Line item content matching (matches, over-billed qty, unauthorised item)
 *    – Anomaly scores set (low / medium / high risk)
 *    – Field correction history (fieldChanges array)
 *    – Re-match after correction (two processingLog Matching Complete entries)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const fs       = require('fs');
const crypto   = require('crypto');
const PDFDocument = require('pdfkit');

const User          = require('../models/User');
const Vendor        = require('../models/Vendor');
const PurchaseOrder = require('../models/PurchaseOrder');
const Invoice       = require('../models/Invoice');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── PDF helpers ─────────────────────────────────────────────────────────────

function writePDF(filepath, lines) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, left: 72, right: 72, bottom: 50 } });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);
    lines.forEach(({ text, size = 12, bold = false, gap = 0 }) => {
      doc.fontSize(size).font(bold ? 'Helvetica-Bold' : 'Helvetica').text(text);
      if (gap) doc.moveDown(gap);
    });
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function fileHash(fp) {
  return crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/invoice-automation');
  console.log('Connected to MongoDB');

  await Promise.all([User.deleteMany({}), Vendor.deleteMany({}), PurchaseOrder.deleteMany({}), Invoice.deleteMany({})]);
  console.log('Wiped existing data\n');

  // ── Users ──────────────────────────────────────────────────────────────────
  const admin = await User.create({ name: 'Admin User',       email: 'admin@company.com',       password: 'admin123',       role: 'admin'       });
  const acct  = await User.create({ name: 'Asha Accountant',  email: 'accountant@company.com',  password: 'accountant123',  role: 'accountant'  });
  await         User.create({ name: 'Victor Viewer',    email: 'viewer@company.com',      password: 'viewer123',      role: 'viewer'      });
  console.log('Users: admin@company.com / accountant@company.com / viewer@company.com');

  // ── Vendors ────────────────────────────────────────────────────────────────
  const [acme, techcorp, global] = await Vendor.create([
    {
      name: 'Acme Supplies Pvt Ltd', email: 'billing@acmesupplies.in',
      phone: '+91-98765-43210', taxId: '27AABCA1234A1Z5',
      registrationNumber: 'MH-REG-20210045', paymentTerms: 'Net 30', status: 'active',
      address: { street: '12, Commerce Park', city: 'Mumbai', state: 'Maharashtra', country: 'India', zipCode: '400001' },
      requiredFields: [
        { fieldKey: 'vendorName', fieldLabel: 'Vendor Name' }, { fieldKey: 'gstNumber', fieldLabel: 'GST Number' },
        { fieldKey: 'invoiceNumber', fieldLabel: 'Invoice Number' }, { fieldKey: 'poNumber', fieldLabel: 'PO Number' },
        { fieldKey: 'invoiceDate', fieldLabel: 'Invoice Date' }, { fieldKey: 'totalAmount', fieldLabel: 'Total Amount' },
        { fieldKey: 'taxAmount', fieldLabel: 'Tax Amount' }
      ]
    },
    {
      name: 'TechCorp Solutions', email: 'accounts@techcorp.com',
      phone: '+1-415-555-0100', taxId: 'TC-EIN-82-1234567',
      registrationNumber: 'CA-CORP-54321', paymentTerms: 'Net 15', status: 'active',
      address: { street: '500 Market St', city: 'San Francisco', state: 'CA', country: 'USA', zipCode: '94105' },
      requiredFields: [
        { fieldKey: 'vendorName', fieldLabel: 'Vendor Name' }, { fieldKey: 'invoiceNumber', fieldLabel: 'Invoice Number' },
        { fieldKey: 'poNumber', fieldLabel: 'PO Number' }, { fieldKey: 'invoiceDate', fieldLabel: 'Invoice Date' },
        { fieldKey: 'totalAmount', fieldLabel: 'Total Amount' }, { fieldKey: 'subTotal', fieldLabel: 'Subtotal' },
        { fieldKey: 'currency', fieldLabel: 'Currency' }
      ]
    },
    {
      name: 'Global Services LLC', email: 'finance@globalservices.io',
      phone: '+1-512-555-0200', taxId: 'GS-EIN-47-9876543',
      registrationNumber: 'TX-LLC-99876', paymentTerms: 'Net 60', status: 'active',
      address: { street: '300 Congress Ave', city: 'Austin', state: 'TX', country: 'USA', zipCode: '78701' },
      requiredFields: [
        { fieldKey: 'vendorName', fieldLabel: 'Vendor Name' }, { fieldKey: 'invoiceNumber', fieldLabel: 'Invoice Number' },
        { fieldKey: 'invoiceDate', fieldLabel: 'Invoice Date' }, { fieldKey: 'dueDate', fieldLabel: 'Due Date' },
        { fieldKey: 'totalAmount', fieldLabel: 'Total Amount' }, { fieldKey: 'bankAccount', fieldLabel: 'Bank Account' }
      ]
    }
  ]);
  console.log(`Vendors: ${acme.name} | ${techcorp.name} | ${global.name}`);

  // ── Purchase Orders ────────────────────────────────────────────────────────
  const ts = Date.now();

  // Acme POs (INR)
  const acmePO1 = await PurchaseOrder.create({
    vendor: acme._id, currency: 'INR', status: 'approved', createdBy: admin._id,
    issueDate: new Date('2026-04-01'), expectedDelivery: new Date('2026-04-30'),
    poNumber: 'PO-ACME-001', notes: 'Office furniture — Mumbai office setup',
    lineItems: [
      { description: 'Ergonomic Office Chair',        quantity: 20, unitPrice: 1200, totalPrice: 24000 },
      { description: 'Standing Desk (Height Adjust)', quantity: 10, unitPrice: 1500, totalPrice: 15000 },
      { description: 'Dell Monitor 24 inch',          quantity: 10, unitPrice: 900,  totalPrice: 9000  }
    ],
    subTotal: 48000, taxRate: 18, tax: 8640, totalAmount: 56640
  });

  const acmePO2 = await PurchaseOrder.create({
    vendor: acme._id, currency: 'INR', status: 'closed', createdBy: admin._id,
    issueDate: new Date('2026-04-15'), expectedDelivery: new Date('2026-05-15'),
    poNumber: 'PO-ACME-002', notes: 'IT hardware refresh',
    lineItems: [
      { description: 'Laptop HP EliteBook 840',   quantity: 5, unitPrice: 8500, totalPrice: 42500 },
      { description: 'Wireless Mouse + Keyboard', quantity: 5, unitPrice: 350,  totalPrice: 1750  },
      { description: 'Laptop Bag 15 inch',        quantity: 5, unitPrice: 750,  totalPrice: 3750  }
    ],
    subTotal: 48000, taxRate: 18, tax: 8640, totalAmount: 56640
  });

  const acmePO3 = await PurchaseOrder.create({
    vendor: acme._id, currency: 'INR', status: 'draft', createdBy: admin._id,
    issueDate: new Date('2026-05-01'), poNumber: 'PO-ACME-003', notes: 'Stationery Q2',
    lineItems: [
      { description: 'A4 Paper Ream (500 sheets)', quantity: 50, unitPrice: 220, totalPrice: 11000 },
      { description: 'Printer Ink Cartridge Set',  quantity: 10, unitPrice: 650, totalPrice: 6500  },
      { description: 'Stapler + Pins Bundle',      quantity: 20, unitPrice: 125, totalPrice: 2500  }
    ],
    subTotal: 20000, taxRate: 12, tax: 2400, totalAmount: 22400
  });

  // TechCorp POs (USD)
  const techPO1 = await PurchaseOrder.create({
    vendor: techcorp._id, currency: 'USD', status: 'approved', createdBy: admin._id,
    issueDate: new Date('2026-03-10'), expectedDelivery: new Date('2026-04-10'),
    poNumber: 'PO-TECH-001', notes: 'Server hardware for data center expansion',
    lineItems: [
      { description: 'Dell PowerEdge R740 Server', quantity: 2, unitPrice: 4500, totalPrice: 9000 },
      { description: 'RAM DDR4 32GB ECC',           quantity: 8, unitPrice: 350,  totalPrice: 2800 },
      { description: 'SSD 2TB NVMe',               quantity: 4, unitPrice: 300,  totalPrice: 1200 }
    ],
    subTotal: 13000, taxRate: 8.5, tax: 1105, totalAmount: 14105
  });

  const techPO2 = await PurchaseOrder.create({
    vendor: techcorp._id, currency: 'USD', status: 'approved', createdBy: admin._id,
    issueDate: new Date('2026-04-01'), expectedDelivery: new Date('2026-04-20'),
    poNumber: 'PO-TECH-002', notes: 'Software licenses — annual renewal',
    lineItems: [
      { description: 'Microsoft 365 Business - Annual (50 seats)', quantity: 50, unitPrice: 150, totalPrice: 7500 },
      { description: 'Adobe Creative Cloud - Team License',        quantity: 5,  unitPrice: 600, totalPrice: 3000 }
    ],
    subTotal: 10500, taxRate: 0, tax: 0, totalAmount: 10500
  });

  const techPO3 = await PurchaseOrder.create({
    vendor: techcorp._id, currency: 'USD', status: 'approved', createdBy: admin._id,
    issueDate: new Date('2026-05-05'), poNumber: 'PO-TECH-003', notes: 'Network infrastructure',
    lineItems: [
      { description: 'Cisco Catalyst 2960 Switch (48-port)', quantity: 3,  unitPrice: 1800, totalPrice: 5400 },
      { description: 'Cat6 Cable 100m Reel',                 quantity: 10, unitPrice: 80,   totalPrice: 800  },
      { description: 'Patch Panel 48-port',                  quantity: 3,  unitPrice: 250,  totalPrice: 750  }
    ],
    subTotal: 6950, taxRate: 8.5, tax: 590.75, totalAmount: 7540.75
  });

  // Global POs (USD)
  const globalPO1 = await PurchaseOrder.create({
    vendor: global._id, currency: 'USD', status: 'approved', createdBy: admin._id,
    issueDate: new Date('2026-02-01'), expectedDelivery: new Date('2026-03-01'),
    poNumber: 'PO-GLOB-001', notes: 'Cloud infrastructure — annual subscriptions',
    lineItems: [
      { description: 'AWS EC2 Reserved Instance - 1 Year', quantity: 1, unitPrice: 1200, totalPrice: 1200 },
      { description: 'Cloudflare Pro Plan - 12 months',    quantity: 1, unitPrice: 240,  totalPrice: 240  },
      { description: 'Datadog APM - 12 months',            quantity: 1, unitPrice: 960,  totalPrice: 960  }
    ],
    subTotal: 2400, taxRate: 0, tax: 0, totalAmount: 2400
  });

  const globalPO2 = await PurchaseOrder.create({
    vendor: global._id, currency: 'USD', status: 'approved', createdBy: admin._id,
    issueDate: new Date('2026-03-15'), expectedDelivery: new Date('2026-04-15'),
    poNumber: 'PO-GLOB-002', notes: 'Security audit and penetration testing',
    lineItems: [
      { description: 'External Security Audit - 5 days',    quantity: 5, unitPrice: 800, totalPrice: 4000 },
      { description: 'Penetration Testing Report',          quantity: 1, unitPrice: 500, totalPrice: 500  },
      { description: 'Remediation Consultation - 2 hours',  quantity: 2, unitPrice: 250, totalPrice: 500  }
    ],
    subTotal: 5000, taxRate: 0, tax: 0, totalAmount: 5000
  });

  const globalPO3 = await PurchaseOrder.create({
    vendor: global._id, currency: 'USD', status: 'draft', createdBy: admin._id,
    issueDate: new Date('2026-05-20'), poNumber: 'PO-GLOB-003', notes: 'SaaS tool licenses — engineering team',
    lineItems: [
      { description: 'GitHub Enterprise - 30 seats', quantity: 30, unitPrice: 210, totalPrice: 6300 },
      { description: 'Figma Organization - 10 seats', quantity: 10, unitPrice: 450, totalPrice: 4500 }
    ],
    subTotal: 10800, taxRate: 0, tax: 0, totalAmount: 10800
  });

  console.log('Purchase Orders: 9 created (3 per vendor)\n');
  console.log('Building invoices…');

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICE 1 — UPLOADED (normal, Acme → PO-ACME-001)
  // User path: click "Start OCR"
  // ══════════════════════════════════════════════════════════════════════════
  const f1 = `invoice-stress-001-${ts}.pdf`;
  const p1 = path.join(UPLOADS_DIR, f1);
  await writePDF(p1, [
    { text: 'TAX INVOICE', size: 22, bold: true, gap: 0.5 },
    { text: 'Vendor: Acme Supplies Pvt Ltd', size: 12 },
    { text: 'Address: 12, Commerce Park, Mumbai, Maharashtra, India', size: 10 },
    { text: 'GSTIN: 27AABCA1234A1Z5', size: 12, gap: 0.5 },
    { text: 'Invoice Number: INV-ACME-2026-001', size: 12 },
    { text: 'Invoice Date: 02/06/2026', size: 12 },
    { text: 'Due Date: 02/07/2026', size: 12 },
    { text: 'PO Number: PO-ACME-001', size: 12, gap: 0.5 },
    { text: 'Ergonomic Office Chair      x20  @1200   24000.00', size: 10 },
    { text: 'Standing Desk (Height Adj)  x10  @1500   15000.00', size: 10 },
    { text: 'Dell Monitor 24 inch        x10   @900    9000.00', size: 10, gap: 0.5 },
    { text: 'Subtotal:      Rs.48000.00', size: 12 },
    { text: 'Tax (GST 18%): Rs.8640.00', size: 12 },
    { text: 'Total Amount:  Rs.56640.00', size: 14, bold: true },
    { text: 'Currency: INR', size: 11 },
    { text: 'Bank Account: 50200045678901', size: 11 }
  ]);
  await Invoice.create({
    status: 'uploaded', vendor: acme._id, purchaseOrder: acmePO1._id,
    uploadedFile: { filename: f1, originalName: 'Acme-Invoice-001.pdf', mimetype: 'application/pdf', path: `uploads/${f1}`, size: fs.statSync(p1).size, hash: fileHash(p1) },
    processingLog: [{ action: 'Invoice Uploaded', details: 'File: Acme-Invoice-001.pdf. Ready for OCR.', status: 'info' }],
    createdBy: admin._id
  });
  console.log('  [1/12] UPLOADED — Acme-Invoice-001 → PO-ACME-001');

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICE 2 — UPLOADED (will be flagged as duplicate of invoice 1 above)
  // Same invoice number, same vendor — triggers SHA-256 + invoice# duplicate check
  // ══════════════════════════════════════════════════════════════════════════
  const f2 = `invoice-stress-002-${ts}.pdf`;
  const p2 = path.join(UPLOADS_DIR, f2);
  await writePDF(p2, [
    { text: 'TAX INVOICE', size: 22, bold: true, gap: 0.5 },
    { text: 'Vendor: Acme Supplies Pvt Ltd', size: 12 },
    { text: 'GSTIN: 27AABCA1234A1Z5', size: 12, gap: 0.5 },
    { text: 'Invoice Number: INV-ACME-2026-001', size: 12 },
    { text: 'Invoice Date: 02/06/2026', size: 12 },
    { text: 'PO Number: PO-ACME-001', size: 12, gap: 0.5 },
    { text: '*** DUPLICATE SUBMISSION — SAME INVOICE NUMBER ***', size: 10, bold: true },
    { text: 'Total Amount: Rs.56640.00', size: 14, bold: true },
    { text: 'Currency: INR', size: 11 }
  ]);
  await Invoice.create({
    status: 'uploaded', vendor: acme._id, purchaseOrder: acmePO1._id,
    uploadedFile: { filename: f2, originalName: 'Acme-Invoice-001-DUPLICATE.pdf', mimetype: 'application/pdf', path: `uploads/${f2}`, size: fs.statSync(p2).size, hash: fileHash(p2) },
    processingLog: [{ action: 'Invoice Uploaded', details: 'File: Acme-Invoice-001-DUPLICATE.pdf. Potential duplicate — same invoice number as a prior upload.', status: 'warning' }],
    createdBy: acct._id
  });
  console.log('  [2/12] UPLOADED — Acme-Invoice-001-DUPLICATE (same inv# as above — duplicate detection test)');

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICE 3 — OCR_EXTRACTED (clean, high confidence, TechCorp → PO-TECH-001)
  // OCR typo in vendorName ('Soiutions' instead of 'Solutions') for user to fix
  // ══════════════════════════════════════════════════════════════════════════
  const f3 = `invoice-stress-003-${ts}.pdf`;
  const p3 = path.join(UPLOADS_DIR, f3);
  await writePDF(p3, [
    { text: 'INVOICE', size: 22, bold: true, gap: 0.5 },
    { text: 'From: TechCorp Solutions', size: 12 },
    { text: '500 Market St, San Francisco, CA 94105, USA', size: 10 },
    { text: 'Invoice Number: INV-TC-2026-0141', size: 12 },
    { text: 'Invoice Date: 20/03/2026', size: 12 },
    { text: 'PO Number: PO-TECH-001', size: 12 },
    { text: 'Currency: USD', size: 11, gap: 0.5 },
    { text: 'Dell PowerEdge R740 Server  x2  @4500   9000.00', size: 10 },
    { text: 'RAM DDR4 32GB ECC           x8   @350   2800.00', size: 10 },
    { text: 'SSD 2TB NVMe               x4   @300   1200.00', size: 10, gap: 0.5 },
    { text: 'Subtotal:     $13000.00', size: 12 },
    { text: 'Tax (8.5%):    $1105.00', size: 12 },
    { text: 'Total Amount: $14105.00', size: 14, bold: true }
  ]);
  await Invoice.create({
    status: 'ocr_extracted', vendor: techcorp._id, purchaseOrder: techPO1._id,
    invoiceNumber: 'INV-TC-2026-0141',
    uploadedFile: { filename: f3, originalName: 'TechCorp-Invoice-0141.pdf', mimetype: 'application/pdf', path: `uploads/${f3}`, size: fs.statSync(p3).size, hash: fileHash(p3) },
    ocrText: 'INVOICE\nFrom: TechCorp Solutions\nInvoice Number: INV-TC-2026-0141\nInvoice Date: 20/03/2026\nPO Number: PO-TECH-001\nCurrency: USD\nDell PowerEdge R740 Server x2 @4500 9000.00\nRAM DDR4 32GB ECC x8 @350 2800.00\nSSD 2TB NVMe x4 @300 1200.00\nSubtotal: $13000.00\nTax (8.5%): $1105.00\nTotal Amount: $14105.00',
    extractedData: {
      vendorName:    { value: 'TechCorp Soiutions', confidence: 68 }, // intentional OCR typo
      invoiceNumber: { value: 'INV-TC-2026-0141',  confidence: 92 },
      poNumber:      { value: 'PO-TECH-001',        confidence: 90 },
      invoiceDate:   { value: '20/03/2026',          confidence: 87 },
      currency:      { value: 'USD',                 confidence: 95 },
      subTotal:      { value: 13000,                 confidence: 88 },
      tax:           { value: 1105,                  confidence: 85 },
      totalAmount:   { value: 14105,                 confidence: 91 },
      gstNumber: { value: null, confidence: 0 }, dueDate: { value: null, confidence: 0 }, bankAccount: { value: null, confidence: 0 },
      lineItems: [
        { description: 'Dell PowerEdge R740 Server', quantity: 2, unitPrice: 4500, totalPrice: 9000,  confidence: 80 },
        { description: 'RAM DDR4 32GB ECC',           quantity: 8, unitPrice: 350,  totalPrice: 2800,  confidence: 78 },
        { description: 'SSD 2TB NVMe',               quantity: 4, unitPrice: 300,  totalPrice: 1200,  confidence: 75 }
      ],
      overallConfidence: 83, extractedFieldCount: 6, totalFields: 8
    },
    anomalyScore: 0.12, riskLevel: 'low',
    processingLog: [
      { action: 'Invoice Uploaded', details: 'File: TechCorp-Invoice-0141.pdf', status: 'info' },
      { action: 'OCR Complete', details: 'Extracted 412 chars via pdf-parse (confidence: 90%). Fields: 6/8. Anomaly score: 0.12 (low risk)', status: 'success' }
    ],
    createdBy: admin._id
  });
  console.log('  [3/12] OCR_EXTRACTED — TechCorp-Invoice-0141 with vendorName OCR typo (low anomaly)');

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICE 4 — OCR_EXTRACTED (poor confidence, missing fields, Global → PO-GLOB-002)
  // Tests the low-confidence / incomplete extraction display
  // ══════════════════════════════════════════════════════════════════════════
  const f4 = `invoice-stress-004-${ts}.pdf`;
  const p4 = path.join(UPLOADS_DIR, f4);
  await writePDF(p4, [
    { text: 'Invoice', size: 18, bold: true, gap: 0.5 },
    { text: 'Global Services LLC', size: 12 },
    { text: 'Invoice#: INV-GLOB-2026-055', size: 11 },
    { text: 'Date: 01/04/2026', size: 11 },
    { text: 'PO-GLOB-002', size: 11, gap: 0.5 },
    { text: 'Security Audit 5 days     4000.00', size: 10 },
    { text: 'Pen Test Report            500.00', size: 10 },
    { text: 'Consultation 2h            500.00', size: 10, gap: 0.5 },
    { text: 'Total: $5000.00', size: 13, bold: true },
    { text: '(scanned copy — low OCR quality)', size: 9 }
  ]);
  await Invoice.create({
    status: 'ocr_extracted', vendor: global._id, purchaseOrder: globalPO2._id,
    invoiceNumber: 'INV-GLOB-2026-055',
    uploadedFile: { filename: f4, originalName: 'Global-Invoice-055-scan.pdf', mimetype: 'application/pdf', path: `uploads/${f4}`, size: fs.statSync(p4).size, hash: fileHash(p4) },
    ocrText: 'Invoice\nGlobal Services LLC\nInvoice#: INV-GLOB-2026-055\nDate: 01/04/2026\nPO-GLOB-002\nSecurity Audit 5 days 4000.00\nPen Test Report 500.00\nConsultation 2h 500.00\nTotal: $5000.00',
    extractedData: {
      vendorName:    { value: 'Global Services LLC', confidence: 55 },
      invoiceNumber: { value: 'INV-GLOB-2026-055',   confidence: 60 },
      poNumber:      { value: 'PO-GLOB-002',          confidence: 72 },
      invoiceDate:   { value: '01/04/2026',            confidence: 50 },
      totalAmount:   { value: 5000,                    confidence: 65 },
      subTotal:      { value: null,                    confidence: 0  },
      tax:           { value: null,                    confidence: 0  },
      currency:      { value: 'USD',                   confidence: 60 },
      dueDate:       { value: null,                    confidence: 0  },
      bankAccount:   { value: null,                    confidence: 0  },
      gstNumber:     { value: null,                    confidence: 0  },
      lineItems: [
        { description: 'Security Audit 5 days',  quantity: 1, unitPrice: 4000, totalPrice: 4000, confidence: 45 },
        { description: 'Pen Test Report',         quantity: 1, unitPrice: 500,  totalPrice: 500,  confidence: 42 },
        { description: 'Consultation 2h',         quantity: 1, unitPrice: 500,  totalPrice: 500,  confidence: 40 }
      ],
      overallConfidence: 44, extractedFieldCount: 4, totalFields: 8
    },
    anomalyScore: 0.38, riskLevel: 'medium',
    processingLog: [
      { action: 'Invoice Uploaded', details: 'File: Global-Invoice-055-scan.pdf', status: 'info' },
      { action: 'OCR Complete', details: 'Extracted 198 chars (low quality scan). Fields: 4/8. Overall confidence: 44%. Anomaly score: 0.38 (medium risk) — please review carefully.', status: 'warning' }
    ],
    createdBy: acct._id
  });
  console.log('  [4/12] OCR_EXTRACTED — Global-Invoice-055 poor confidence scan (medium anomaly, 4/8 fields)');

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICE 5 — PENDING_REVIEW (ready to match, Global → PO-GLOB-001)
  // All fields verified, user can click "Submit for Matching"
  // ══════════════════════════════════════════════════════════════════════════
  const f5 = `invoice-stress-005-${ts}.pdf`;
  const p5 = path.join(UPLOADS_DIR, f5);
  await writePDF(p5, [
    { text: 'SERVICE INVOICE', size: 20, bold: true, gap: 0.5 },
    { text: 'Vendor: Global Services LLC', size: 12 },
    { text: '300 Congress Ave, Austin, TX 78701, USA', size: 10, gap: 0.5 },
    { text: 'Invoice Number: INV-GLOB-2026-031', size: 12 },
    { text: 'Invoice Date: 05/02/2026', size: 12 },
    { text: 'Due Date: 06/04/2026', size: 12 },
    { text: 'PO Number: PO-GLOB-001', size: 12, gap: 0.5 },
    { text: 'AWS EC2 Reserved Instance  x1  @1200  1200.00', size: 10 },
    { text: 'Cloudflare Pro Plan        x1   @240   240.00', size: 10 },
    { text: 'Datadog APM 12 months      x1   @960   960.00', size: 10, gap: 0.5 },
    { text: 'Subtotal:     $2400.00', size: 12 },
    { text: 'Tax:             $0.00', size: 12 },
    { text: 'Total Amount: $2400.00', size: 14, bold: true },
    { text: 'Account Number: 3456789012', size: 11 }
  ]);
  await Invoice.create({
    status: 'pending_review', vendor: global._id, purchaseOrder: globalPO1._id,
    invoiceNumber: 'INV-GLOB-2026-031',
    uploadedFile: { filename: f5, originalName: 'GlobalServices-Invoice-031.pdf', mimetype: 'application/pdf', path: `uploads/${f5}`, size: fs.statSync(p5).size, hash: fileHash(p5) },
    ocrText: 'SERVICE INVOICE\nVendor: Global Services LLC\nInvoice Number: INV-GLOB-2026-031\nInvoice Date: 05/02/2026\nDue Date: 06/04/2026\nPO Number: PO-GLOB-001\nSubtotal: $2400.00\nTax: $0.00\nTotal Amount: $2400.00\nAccount Number: 3456789012',
    extractedData: {
      vendorName:    { value: 'Global Services LLC', confidence: 82 },
      invoiceNumber: { value: 'INV-GLOB-2026-031',   confidence: 90 },
      poNumber:      { value: 'PO-GLOB-001',          confidence: 88 },
      invoiceDate:   { value: '05/02/2026',            confidence: 85 },
      dueDate:       { value: '06/04/2026',            confidence: 85 },
      totalAmount:   { value: 2400,                    confidence: 93 },
      subTotal:      { value: 2400,                    confidence: 90 },
      tax:           { value: 0,                       confidence: 88 },
      currency:      { value: 'USD',                   confidence: 80 },
      bankAccount:   { value: '3456789012',            confidence: 82 },
      gstNumber:     { value: null,                    confidence: 0  },
      lineItems: [
        { description: 'AWS EC2 Reserved Instance', quantity: 1, unitPrice: 1200, totalPrice: 1200, confidence: 78 },
        { description: 'Cloudflare Pro Plan',        quantity: 1, unitPrice: 240,  totalPrice: 240,  confidence: 75 },
        { description: 'Datadog APM 12 months',      quantity: 1, unitPrice: 960,  totalPrice: 960,  confidence: 76 }
      ],
      overallConfidence: 87, extractedFieldCount: 8, totalFields: 8
    },
    userVerifiedData: {
      vendorName: 'Global Services LLC', invoiceNumber: 'INV-GLOB-2026-031',
      invoiceDate: '05/02/2026', dueDate: '06/04/2026',
      totalAmount: 2400, bankAccount: '3456789012', poNumber: 'PO-GLOB-001'
    },
    anomalyScore: 0.09, riskLevel: 'low',
    processingLog: [
      { action: 'Invoice Uploaded', details: 'File: GlobalServices-Invoice-031.pdf', status: 'info' },
      { action: 'OCR Complete', details: 'Extracted 310 chars. Fields: 8/8. Low anomaly.', status: 'success' },
      { action: 'Fields Saved', details: 'User verified and saved 7 field(s)', status: 'info' }
    ],
    createdBy: admin._id
  });
  console.log('  [5/12] PENDING_REVIEW — GlobalServices-031 ready to submit for matching');

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICE 6 — PENDING_REVIEW (with field correction history, TechCorp → PO-TECH-003)
  // vendorName and invoiceDate were corrected by accountant — tests fieldChanges display
  // ══════════════════════════════════════════════════════════════════════════
  const f6 = `invoice-stress-006-${ts}.pdf`;
  const p6 = path.join(UPLOADS_DIR, f6);
  await writePDF(p6, [
    { text: 'INVOICE', size: 22, bold: true, gap: 0.5 },
    { text: 'TechCorp Solutions', size: 12 },
    { text: 'Invoice No: INV-TC-2026-0301', size: 12 },
    { text: 'Date: 12/05/2026', size: 12 },
    { text: 'PO: PO-TECH-003', size: 12 },
    { text: 'Currency: USD', size: 11, gap: 0.5 },
    { text: 'Cisco Catalyst 2960 Switch  x3  @1800  5400.00', size: 10 },
    { text: 'Cat6 Cable 100m Reel       x10   @80    800.00', size: 10 },
    { text: 'Patch Panel 48-port         x3  @250    750.00', size: 10, gap: 0.5 },
    { text: 'Subtotal:    $6950.00', size: 12 },
    { text: 'Tax (8.5%):  $590.75', size: 12 },
    { text: 'Total Amount: $7540.75', size: 14, bold: true }
  ]);
  await Invoice.create({
    status: 'pending_review', vendor: techcorp._id, purchaseOrder: techPO3._id,
    invoiceNumber: 'INV-TC-2026-0301',
    uploadedFile: { filename: f6, originalName: 'TechCorp-Invoice-0301.pdf', mimetype: 'application/pdf', path: `uploads/${f6}`, size: fs.statSync(p6).size, hash: fileHash(p6) },
    ocrText: 'INVOICE\nTechCorp Solutions\nInvoice No: INV-TC-2026-0301\nDate: 12/05/2026\nPO: PO-TECH-003\nCurrency: USD\nCisco Catalyst 2960 Switch x3 @1800 5400.00\nCat6 Cable 100m Reel x10 @80 800.00\nPatch Panel 48-port x3 @250 750.00\nSubtotal: $6950.00\nTax (8.5%): $590.75\nTotal Amount: $7540.75',
    extractedData: {
      vendorName:    { value: 'TechC0rp Solutions', confidence: 62 }, // OCR artifact: '0' instead of 'o'
      invoiceNumber: { value: 'INV-TC-2026-0301',   confidence: 89 },
      poNumber:      { value: 'PO-TECH-003',         confidence: 87 },
      invoiceDate:   { value: '12/15/2026',           confidence: 55 }, // OCR misread month/day
      currency:      { value: 'USD',                  confidence: 94 },
      subTotal:      { value: 6950,                   confidence: 86 },
      tax:           { value: 590.75,                 confidence: 83 },
      totalAmount:   { value: 7540.75,                confidence: 90 },
      gstNumber: { value: null, confidence: 0 }, dueDate: { value: null, confidence: 0 }, bankAccount: { value: null, confidence: 0 },
      lineItems: [
        { description: 'Cisco Catalyst 2960 Switch', quantity: 3,  unitPrice: 1800, totalPrice: 5400, confidence: 77 },
        { description: 'Cat6 Cable 100m Reel',        quantity: 10, unitPrice: 80,   totalPrice: 800,  confidence: 74 },
        { description: 'Patch Panel 48-port',         quantity: 3,  unitPrice: 250,  totalPrice: 750,  confidence: 75 }
      ],
      overallConfidence: 75, extractedFieldCount: 6, totalFields: 8
    },
    userVerifiedData: {
      vendorName: 'TechCorp Solutions', invoiceNumber: 'INV-TC-2026-0301',
      poNumber: 'PO-TECH-003', invoiceDate: '12/05/2026',
      totalAmount: 7540.75, subTotal: 6950, currency: 'USD'
    },
    fieldChanges: [
      { field: 'vendorName', oldValue: 'TechC0rp Solutions', newValue: 'TechCorp Solutions', changedBy: acct._id, changedAt: new Date('2026-05-13T09:15:00Z') },
      { field: 'invoiceDate', oldValue: '12/15/2026', newValue: '12/05/2026', changedBy: acct._id, changedAt: new Date('2026-05-13T09:16:00Z') }
    ],
    anomalyScore: 0.15, riskLevel: 'low',
    processingLog: [
      { action: 'Invoice Uploaded', details: 'File: TechCorp-Invoice-0301.pdf', status: 'info' },
      { action: 'OCR Complete', details: 'Fields: 6/8. Confidence: 75%. vendorName and invoiceDate flagged low-confidence.', status: 'warning' },
      { action: 'Fields Saved', details: 'Accountant corrected vendorName (OCR artifact) and invoiceDate (month/day swap). 7 fields saved.', status: 'info' }
    ],
    createdBy: acct._id
  });
  console.log('  [6/12] PENDING_REVIEW — TechCorp-Invoice-0301 with 2 field corrections logged');

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICE 7 — PASSED (perfect match, 97%, Acme → PO-ACME-002)
  // ══════════════════════════════════════════════════════════════════════════
  const f7 = `invoice-stress-007-${ts}.pdf`;
  const p7 = path.join(UPLOADS_DIR, f7);
  await writePDF(p7, [
    { text: 'TAX INVOICE', size: 22, bold: true, gap: 0.5 },
    { text: 'Vendor: Acme Supplies Pvt Ltd', size: 12 },
    { text: 'GSTIN: 27AABCA1234A1Z5', size: 12, gap: 0.5 },
    { text: 'Invoice Number: INV-ACME-2026-002', size: 12 },
    { text: 'Invoice Date: 20/04/2026', size: 12 },
    { text: 'PO Number: PO-ACME-002', size: 12, gap: 0.5 },
    { text: 'Laptop HP EliteBook 840   x5  @8500  42500.00', size: 10 },
    { text: 'Wireless Mouse + Keyboard x5   @350   1750.00', size: 10 },
    { text: 'Laptop Bag 15 inch        x5   @750   3750.00', size: 10, gap: 0.5 },
    { text: 'Subtotal:  Rs.48000.00', size: 12 },
    { text: 'GST:        Rs.8640.00', size: 12 },
    { text: 'Total Amount: Rs.56640.00', size: 14, bold: true },
    { text: 'Currency: INR', size: 11 },
    { text: 'Account: 50200045678901', size: 11 }
  ]);
  await Invoice.create({
    status: 'passed', vendor: acme._id, purchaseOrder: acmePO2._id,
    invoiceNumber: 'INV-ACME-2026-002',
    uploadedFile: { filename: f7, originalName: 'Acme-Invoice-002.pdf', mimetype: 'application/pdf', path: `uploads/${f7}`, size: fs.statSync(p7).size, hash: fileHash(p7) },
    ocrText: 'TAX INVOICE\nVendor: Acme Supplies Pvt Ltd\nGSTIN: 27AABCA1234A1Z5\nInvoice Number: INV-ACME-2026-002\nInvoice Date: 20/04/2026\nPO Number: PO-ACME-002\nSubtotal: Rs.48000.00\nGST: Rs.8640.00\nTotal Amount: Rs.56640.00\nCurrency: INR',
    extractedData: {
      vendorName:    { value: 'Acme Supplies Pvt Ltd', confidence: 85 },
      gstNumber:     { value: '27AABCA1234A1Z5',       confidence: 95 },
      invoiceNumber: { value: 'INV-ACME-2026-002',      confidence: 92 },
      poNumber:      { value: 'PO-ACME-002',            confidence: 90 },
      invoiceDate:   { value: '20/04/2026',              confidence: 88 },
      totalAmount:   { value: 56640,                     confidence: 91 },
      subTotal:      { value: 48000,                     confidence: 89 },
      tax:           { value: 8640,                      confidence: 87 },
      currency:      { value: 'INR',                     confidence: 92 },
      bankAccount:   { value: '50200045678901',          confidence: 80 },
      dueDate: { value: null, confidence: 0 }, gstNumber: { value: '27AABCA1234A1Z5', confidence: 95 },
      lineItems: [
        { description: 'Laptop HP EliteBook 840',   quantity: 5, unitPrice: 8500, totalPrice: 42500, confidence: 82 },
        { description: 'Wireless Mouse + Keyboard', quantity: 5, unitPrice: 350,  totalPrice: 1750,  confidence: 78 },
        { description: 'Laptop Bag 15 inch',        quantity: 5, unitPrice: 750,  totalPrice: 3750,  confidence: 80 }
      ],
      overallConfidence: 89, extractedFieldCount: 8, totalFields: 8
    },
    userVerifiedData: {
      vendorName: 'Acme Supplies Pvt Ltd', gstNumber: '27AABCA1234A1Z5',
      invoiceNumber: 'INV-ACME-2026-002', poNumber: 'PO-ACME-002',
      invoiceDate: '20/04/2026', totalAmount: 56640, taxAmount: 8640
    },
    fieldChanges: [
      { field: 'vendorName', oldValue: 'Acme Supplies', newValue: 'Acme Supplies Pvt Ltd', changedBy: admin._id, changedAt: new Date('2026-04-21T10:30:00Z') }
    ],
    validationResult: {
      status: 'passed', matchScore: 97, discrepancies: [],
      duplicateCheck: { isDuplicate: false, similarInvoiceId: null }
    },
    anomalyScore: 0.07, riskLevel: 'low',
    processingLog: [
      { action: 'Invoice Uploaded', details: 'File: Acme-Invoice-002.pdf', status: 'info' },
      { action: 'OCR Complete', details: 'Fields: 8/8. Confidence: 89%. Low anomaly.', status: 'success' },
      { action: 'Fields Saved', details: 'vendorName corrected. 7 fields saved.', status: 'info' },
      { action: 'Matching Complete', details: 'Score: 97% | Status: passed | Discrepancies: 0', status: 'success' }
    ],
    createdBy: admin._id
  });
  console.log('  [7/12] PASSED — Acme-Invoice-002, 97% match score, PO-ACME-002 closed');

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICE 8 — PASSED (minor subTotal rounding diff, 88%, Global → PO-GLOB-002)
  // Re-matched once after user corrected a field — shows two Matching Complete entries
  // ══════════════════════════════════════════════════════════════════════════
  const f8 = `invoice-stress-008-${ts}.pdf`;
  const p8 = path.join(UPLOADS_DIR, f8);
  await writePDF(p8, [
    { text: 'INVOICE', size: 20, bold: true, gap: 0.5 },
    { text: 'Global Services LLC', size: 12 },
    { text: 'Invoice Number: INV-GLOB-2026-042', size: 12 },
    { text: 'Invoice Date: 22/03/2026', size: 12 },
    { text: 'PO Number: PO-GLOB-002', size: 12, gap: 0.5 },
    { text: 'External Security Audit  x5  @800   4000.00', size: 10 },
    { text: 'Penetration Testing      x1  @500    500.00', size: 10 },
    { text: 'Remediation Consulting   x2  @250    500.00', size: 10, gap: 0.5 },
    { text: 'Subtotal:    $4980.00', size: 12 },   // slight rounding diff vs PO $5000
    { text: 'Tax:            $0.00', size: 12 },
    { text: 'Total Amount: $4980.00', size: 14, bold: true },
    { text: 'Account: 9876543210', size: 11 },
    { text: 'Due Date: 22/04/2026', size: 11 }
  ]);
  await Invoice.create({
    status: 'passed', vendor: global._id, purchaseOrder: globalPO2._id,
    invoiceNumber: 'INV-GLOB-2026-042',
    uploadedFile: { filename: f8, originalName: 'Global-Invoice-042.pdf', mimetype: 'application/pdf', path: `uploads/${f8}`, size: fs.statSync(p8).size, hash: fileHash(p8) },
    ocrText: 'INVOICE\nGlobal Services LLC\nInvoice Number: INV-GLOB-2026-042\nDate: 22/03/2026\nPO Number: PO-GLOB-002\nSubtotal: $4980.00\nTax: $0.00\nTotal Amount: $4980.00',
    extractedData: {
      vendorName:    { value: 'Global Services LLC', confidence: 83 },
      invoiceNumber: { value: 'INV-GLOB-2026-042',   confidence: 91 },
      poNumber:      { value: 'PO-GLOB-002',          confidence: 89 },
      invoiceDate:   { value: '22/03/2026',            confidence: 86 },
      dueDate:       { value: '22/04/2026',            confidence: 84 },
      totalAmount:   { value: 4980,                    confidence: 92 },
      subTotal:      { value: 4980,                    confidence: 90 },
      tax:           { value: 0,                       confidence: 88 },
      currency:      { value: 'USD',                   confidence: 82 },
      bankAccount:   { value: '9876543210',            confidence: 80 },
      gstNumber: { value: null, confidence: 0 },
      lineItems: [
        { description: 'External Security Audit', quantity: 5, unitPrice: 800, totalPrice: 4000, confidence: 76 },
        { description: 'Penetration Testing',      quantity: 1, unitPrice: 500, totalPrice: 500,  confidence: 74 },
        { description: 'Remediation Consulting',   quantity: 2, unitPrice: 250, totalPrice: 500,  confidence: 73 }
      ],
      overallConfidence: 86, extractedFieldCount: 8, totalFields: 8
    },
    userVerifiedData: {
      vendorName: 'Global Services LLC', invoiceNumber: 'INV-GLOB-2026-042',
      invoiceDate: '22/03/2026', dueDate: '22/04/2026',
      totalAmount: 4980, bankAccount: '9876543210', poNumber: 'PO-GLOB-002'
    },
    validationResult: {
      status: 'passed', matchScore: 88,
      discrepancies: [
        { field: 'totalAmount', expected: 5000, actual: 4980, severity: 'low' }
      ],
      duplicateCheck: { isDuplicate: false, similarInvoiceId: null }
    },
    anomalyScore: 0.21, riskLevel: 'low',
    processingLog: [
      { action: 'Invoice Uploaded', details: 'File: Global-Invoice-042.pdf', status: 'info' },
      { action: 'OCR Complete', details: 'Fields: 8/8.', status: 'success' },
      { action: 'Fields Saved', details: '8 fields saved.', status: 'info' },
      { action: 'Matching Complete', details: 'Score: 72% | Status: review_required | totalAmount mismatch ($4980 vs $5000)', status: 'warning' },
      { action: 'Fields Saved', details: 'User re-confirmed totalAmount after consulting vendor. 1 field re-saved.', status: 'info' },
      { action: 'Matching Complete', details: 'Score: 88% | Status: passed | 1 low-severity discrepancy (amount within tolerance)', status: 'success' }
    ],
    createdBy: admin._id
  });
  console.log('  [8/12] PASSED — Global-Invoice-042, 88% match (minor amount diff), re-matched once');

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICE 9 — REVIEW_REQUIRED (amount overcharge + unauthorized line item, TechCorp → PO-TECH-002)
  // ══════════════════════════════════════════════════════════════════════════
  const f9 = `invoice-stress-009-${ts}.pdf`;
  const p9 = path.join(UPLOADS_DIR, f9);
  await writePDF(p9, [
    { text: 'INVOICE', size: 22, bold: true, gap: 0.5 },
    { text: 'From: TechCorp Solutions', size: 12 },
    { text: 'Invoice Number: INV-TC-2026-0189', size: 12 },
    { text: 'Invoice Date: 10/04/2026', size: 12 },
    { text: 'PO Number: PO-TECH-002', size: 12 },
    { text: 'Currency: USD', size: 11, gap: 0.5 },
    { text: 'Microsoft 365 Business - 50 seats  x50  @150  7500.00', size: 10 },
    { text: 'Adobe Creative Cloud Team License   x5   @600  3000.00', size: 10 },
    { text: 'Setup & Configuration Fee (NOT IN PO)', size: 9 },
    { text: 'Setup Fee:                          x1  @1500  1500.00', size: 10, gap: 0.5 },
    { text: 'Subtotal:     $12000.00', size: 12 },
    { text: 'Tax:              $0.00', size: 12 },
    { text: 'Total Amount: $12000.00', size: 14, bold: true },
    { text: '(PO was for $10,500 — unauthorized setup fee of $1,500)', size: 9 }
  ]);
  await Invoice.create({
    status: 'review_required', vendor: techcorp._id, purchaseOrder: techPO2._id,
    invoiceNumber: 'INV-TC-2026-0189',
    uploadedFile: { filename: f9, originalName: 'TechCorp-Invoice-0189.pdf', mimetype: 'application/pdf', path: `uploads/${f9}`, size: fs.statSync(p9).size, hash: fileHash(p9) },
    ocrText: 'INVOICE\nFrom: TechCorp Solutions\nInvoice Number: INV-TC-2026-0189\nInvoice Date: 10/04/2026\nPO Number: PO-TECH-002\nCurrency: USD\nSubtotal: $12000.00\nTax: $0.00\nTotal Amount: $12000.00',
    extractedData: {
      vendorName:    { value: 'TechCorp Solutions', confidence: 88 },
      invoiceNumber: { value: 'INV-TC-2026-0189',   confidence: 92 },
      poNumber:      { value: 'PO-TECH-002',         confidence: 90 },
      invoiceDate:   { value: '10/04/2026',           confidence: 87 },
      currency:      { value: 'USD',                  confidence: 95 },
      subTotal:      { value: 12000,                  confidence: 89 },
      tax:           { value: 0,                      confidence: 85 },
      totalAmount:   { value: 12000,                  confidence: 92 },
      gstNumber: { value: null, confidence: 0 }, dueDate: { value: null, confidence: 0 }, bankAccount: { value: null, confidence: 0 },
      lineItems: [
        { description: 'Microsoft 365 Business - 50 seats', quantity: 50, unitPrice: 150, totalPrice: 7500, confidence: 82 },
        { description: 'Adobe Creative Cloud Team License',  quantity: 5,  unitPrice: 600, totalPrice: 3000, confidence: 80 },
        { description: 'Setup and Configuration Fee',        quantity: 1,  unitPrice: 1500, totalPrice: 1500, confidence: 78 }
      ],
      overallConfidence: 90, extractedFieldCount: 6, totalFields: 8
    },
    userVerifiedData: {
      vendorName: 'TechCorp Solutions', invoiceNumber: 'INV-TC-2026-0189',
      poNumber: 'PO-TECH-002', invoiceDate: '10/04/2026',
      totalAmount: 12000, subTotal: 12000, currency: 'USD'
    },
    validationResult: {
      status: 'review_required', matchScore: 42,
      discrepancies: [
        { field: 'totalAmount', expected: 10500, actual: 12000, severity: 'high' },
        { field: 'subTotal',    expected: 10500, actual: 12000, severity: 'medium' },
        { field: 'lineItem',    expected: 'Item in PO', actual: 'Setup and Configuration Fee', severity: 'high' }
      ],
      duplicateCheck: { isDuplicate: false, similarInvoiceId: null }
    },
    anomalyScore: 0.74, riskLevel: 'high',
    processingLog: [
      { action: 'Invoice Uploaded', details: 'File: TechCorp-Invoice-0189.pdf', status: 'info' },
      { action: 'OCR Complete', details: 'Fields: 6/8. High anomaly score: 0.74', status: 'warning' },
      { action: 'Fields Saved', details: '7 fields saved.', status: 'info' },
      { action: 'Matching Complete', details: 'Score: 42% | Status: review_required | totalAmount $12,000 vs PO $10,500 (+$1,500). Unauthorized line item detected.', status: 'error' }
    ],
    createdBy: admin._id
  });
  console.log('  [9/12] REVIEW_REQUIRED — TechCorp-Invoice-0189, $1500 overcharge + unauthorized line item (high anomaly)');

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICE 10 — REVIEW_REQUIRED (currency mismatch — INR invoice vs USD PO)
  // ══════════════════════════════════════════════════════════════════════════
  const f10 = `invoice-stress-010-${ts}.pdf`;
  const p10 = path.join(UPLOADS_DIR, f10);
  await writePDF(p10, [
    { text: 'INVOICE', size: 22, bold: true, gap: 0.5 },
    { text: 'Vendor: TechCorp Solutions', size: 12 },
    { text: 'Invoice Number: INV-TC-2026-0222', size: 12 },
    { text: 'Invoice Date: 15/05/2026', size: 12 },
    { text: 'PO Number: PO-TECH-003', size: 12, gap: 0.5 },
    { text: 'Cisco Catalyst Switch x3 @1800  5400.00', size: 10 },
    { text: 'Cat6 Cable 100m Reel  x10  @80   800.00', size: 10 },
    { text: 'Patch Panel 48-port    x3 @250   750.00', size: 10, gap: 0.5 },
    { text: 'Subtotal:   Rs.6950.00', size: 12 },
    { text: 'Tax (GST 18%): Rs.1251.00', size: 12 },
    { text: 'Total Amount: Rs.8201.00', size: 14, bold: true },
    { text: 'Currency: INR', size: 11 },
    { text: '*** NOTE: PO was issued in USD but invoice billed in INR ***', size: 9 }
  ]);
  await Invoice.create({
    status: 'review_required', vendor: techcorp._id, purchaseOrder: techPO3._id,
    invoiceNumber: 'INV-TC-2026-0222',
    uploadedFile: { filename: f10, originalName: 'TechCorp-Invoice-0222-currency-mismatch.pdf', mimetype: 'application/pdf', path: `uploads/${f10}`, size: fs.statSync(p10).size, hash: fileHash(p10) },
    ocrText: 'INVOICE\nVendor: TechCorp Solutions\nInvoice Number: INV-TC-2026-0222\nInvoice Date: 15/05/2026\nPO Number: PO-TECH-003\nSubtotal: Rs.6950.00\nTax (GST 18%): Rs.1251.00\nTotal Amount: Rs.8201.00\nCurrency: INR',
    extractedData: {
      vendorName:    { value: 'TechCorp Solutions', confidence: 85 },
      invoiceNumber: { value: 'INV-TC-2026-0222',   confidence: 91 },
      poNumber:      { value: 'PO-TECH-003',         confidence: 88 },
      invoiceDate:   { value: '15/05/2026',           confidence: 86 },
      currency:      { value: 'INR',                  confidence: 88 }, // mismatch — PO is USD
      totalAmount:   { value: 8201,                   confidence: 90 },
      subTotal:      { value: 6950,                   confidence: 88 },
      tax:           { value: 1251,                   confidence: 85 },
      gstNumber: { value: null, confidence: 0 }, dueDate: { value: null, confidence: 0 }, bankAccount: { value: null, confidence: 0 },
      lineItems: [],
      overallConfidence: 88, extractedFieldCount: 6, totalFields: 8
    },
    userVerifiedData: {
      vendorName: 'TechCorp Solutions', invoiceNumber: 'INV-TC-2026-0222',
      poNumber: 'PO-TECH-003', invoiceDate: '15/05/2026',
      totalAmount: 8201, currency: 'INR'
    },
    validationResult: {
      status: 'review_required', matchScore: 38,
      discrepancies: [
        { field: 'currency',     expected: 'USD',     actual: 'INR',  severity: 'high'   },
        { field: 'totalAmount',  expected: 7540.75,   actual: 8201,   severity: 'high'   },
        { field: 'tax',          expected: 0,         actual: 1251,   severity: 'medium' }
      ],
      duplicateCheck: { isDuplicate: false, similarInvoiceId: null }
    },
    anomalyScore: 0.82, riskLevel: 'high',
    processingLog: [
      { action: 'Invoice Uploaded', details: 'File: TechCorp-Invoice-0222-currency-mismatch.pdf', status: 'info' },
      { action: 'OCR Complete', details: 'Fields: 6/8. Very high anomaly score: 0.82', status: 'warning' },
      { action: 'Fields Saved', details: '6 fields saved.', status: 'info' },
      { action: 'Matching Complete', details: 'Score: 38% | Status: review_required | Currency mismatch INR vs USD. Total $8,201 INR vs PO $7,540.75 USD.', status: 'error' }
    ],
    createdBy: acct._id
  });
  console.log('  [10/12] REVIEW_REQUIRED — TechCorp-Invoice-0222, INR billed vs USD PO (very high anomaly 0.82)');

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICE 11 — REVIEW_REQUIRED (no PO linked — fail-closed path)
  // Even with perfect vendor match, no PO = always review_required
  // ══════════════════════════════════════════════════════════════════════════
  const f11 = `invoice-stress-011-${ts}.pdf`;
  const p11 = path.join(UPLOADS_DIR, f11);
  await writePDF(p11, [
    { text: 'INVOICE', size: 22, bold: true, gap: 0.5 },
    { text: 'From: Acme Supplies Pvt Ltd', size: 12 },
    { text: 'GSTIN: 27AABCA1234A1Z5', size: 12, gap: 0.5 },
    { text: 'Invoice Number: INV-ACME-2026-099', size: 12 },
    { text: 'Invoice Date: 10/06/2026', size: 12 },
    { text: '(No PO number present on this invoice)', size: 10, gap: 0.5 },
    { text: 'Miscellaneous Supply - Q2 Batch', size: 11 },
    { text: 'Subtotal:     Rs.15000.00', size: 12 },
    { text: 'Tax (GST 18%): Rs.2700.00', size: 12 },
    { text: 'Total Amount: Rs.17700.00', size: 14, bold: true },
    { text: 'Currency: INR', size: 11 },
    { text: 'Bank Account: 50200045678901', size: 11 }
  ]);
  await Invoice.create({
    status: 'review_required', vendor: acme._id,
    // No purchaseOrder linked
    invoiceNumber: 'INV-ACME-2026-099',
    uploadedFile: { filename: f11, originalName: 'Acme-Invoice-099-noPO.pdf', mimetype: 'application/pdf', path: `uploads/${f11}`, size: fs.statSync(p11).size, hash: fileHash(p11) },
    ocrText: 'INVOICE\nFrom: Acme Supplies Pvt Ltd\nGSTIN: 27AABCA1234A1Z5\nInvoice Number: INV-ACME-2026-099\nInvoice Date: 10/06/2026\nSubtotal: Rs.15000.00\nTax (GST 18%): Rs.2700.00\nTotal Amount: Rs.17700.00',
    extractedData: {
      vendorName:    { value: 'Acme Supplies Pvt Ltd', confidence: 84 },
      gstNumber:     { value: '27AABCA1234A1Z5',       confidence: 93 },
      invoiceNumber: { value: 'INV-ACME-2026-099',      confidence: 90 },
      poNumber:      { value: null,                      confidence: 0  }, // no PO on doc
      invoiceDate:   { value: '10/06/2026',              confidence: 87 },
      totalAmount:   { value: 17700,                     confidence: 91 },
      subTotal:      { value: 15000,                     confidence: 89 },
      tax:           { value: 2700,                      confidence: 87 },
      currency:      { value: 'INR',                     confidence: 90 },
      bankAccount:   { value: '50200045678901',          confidence: 81 },
      dueDate: { value: null, confidence: 0 },
      lineItems: [],
      overallConfidence: 85, extractedFieldCount: 7, totalFields: 8
    },
    userVerifiedData: {
      vendorName: 'Acme Supplies Pvt Ltd', gstNumber: '27AABCA1234A1Z5',
      invoiceNumber: 'INV-ACME-2026-099', invoiceDate: '10/06/2026',
      totalAmount: 17700, currency: 'INR'
    },
    validationResult: {
      status: 'review_required', matchScore: 0,
      discrepancies: [
        { field: 'purchaseOrder', expected: 'Linked PO', actual: 'No PO linked', severity: 'high' }
      ],
      duplicateCheck: { isDuplicate: false, similarInvoiceId: null }
    },
    anomalyScore: 0.61, riskLevel: 'high',
    processingLog: [
      { action: 'Invoice Uploaded', details: 'File: Acme-Invoice-099-noPO.pdf', status: 'info' },
      { action: 'OCR Complete', details: 'Fields: 7/8. No PO number found on document.', status: 'warning' },
      { action: 'Fields Saved', details: '7 fields verified. PO number left blank — no PO found.', status: 'info' },
      { action: 'Matching Complete', details: 'Score: 0% | Status: review_required | No purchase order linked (fail-closed policy). Assign a PO manually to proceed.', status: 'error' }
    ],
    createdBy: acct._id
  });
  console.log('  [11/12] REVIEW_REQUIRED — Acme-Invoice-099, no PO linked (fail-closed path, score 0%)');

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICE 12 — REJECTED (vendor submitted wrong invoice, rejected by admin)
  // ══════════════════════════════════════════════════════════════════════════
  const f12 = `invoice-stress-012-${ts}.pdf`;
  const p12 = path.join(UPLOADS_DIR, f12);
  await writePDF(p12, [
    { text: 'INVOICE', size: 22, bold: true, gap: 0.5 },
    { text: 'From: TechCorp Solutions', size: 12 },
    { text: 'Invoice Number: INV-TC-2026-0155', size: 12 },
    { text: 'Invoice Date: 01/04/2026', size: 12 },
    { text: 'PO Number: PO-TECH-001', size: 12, gap: 0.5 },
    { text: 'WRONG ITEMS — This invoice is for a different client', size: 10, bold: true },
    { text: 'Office Furniture Package  x1  @25000  25000.00', size: 10, gap: 0.5 },
    { text: 'Total Amount: $25000.00', size: 14, bold: true },
    { text: 'Currency: USD', size: 11 }
  ]);
  await Invoice.create({
    status: 'rejected', vendor: techcorp._id, purchaseOrder: techPO1._id,
    invoiceNumber: 'INV-TC-2026-0155',
    uploadedFile: { filename: f12, originalName: 'TechCorp-Invoice-0155-wrong.pdf', mimetype: 'application/pdf', path: `uploads/${f12}`, size: fs.statSync(p12).size, hash: fileHash(p12) },
    ocrText: 'INVOICE\nFrom: TechCorp Solutions\nInvoice Number: INV-TC-2026-0155\nInvoice Date: 01/04/2026\nPO Number: PO-TECH-001\nOffice Furniture Package x1 @25000 25000.00\nTotal Amount: $25000.00\nCurrency: USD',
    extractedData: {
      vendorName:    { value: 'TechCorp Solutions', confidence: 86 },
      invoiceNumber: { value: 'INV-TC-2026-0155',   confidence: 91 },
      poNumber:      { value: 'PO-TECH-001',         confidence: 88 },
      invoiceDate:   { value: '01/04/2026',           confidence: 85 },
      currency:      { value: 'USD',                  confidence: 93 },
      totalAmount:   { value: 25000,                  confidence: 90 },
      subTotal:      { value: 25000,                  confidence: 88 },
      tax:           { value: 0,                      confidence: 82 },
      gstNumber: { value: null, confidence: 0 }, dueDate: { value: null, confidence: 0 }, bankAccount: { value: null, confidence: 0 },
      lineItems: [
        { description: 'Office Furniture Package', quantity: 1, unitPrice: 25000, totalPrice: 25000, confidence: 80 }
      ],
      overallConfidence: 88, extractedFieldCount: 6, totalFields: 8
    },
    userVerifiedData: {
      vendorName: 'TechCorp Solutions', invoiceNumber: 'INV-TC-2026-0155',
      poNumber: 'PO-TECH-001', invoiceDate: '01/04/2026',
      totalAmount: 25000, currency: 'USD'
    },
    validationResult: {
      status: 'review_required', matchScore: 18,
      discrepancies: [
        { field: 'totalAmount', expected: 14105,   actual: 25000, severity: 'high'   },
        { field: 'lineItem',    expected: 'Dell PowerEdge R740 Server', actual: 'Office Furniture Package', severity: 'high' }
      ],
      duplicateCheck: { isDuplicate: false, similarInvoiceId: null }
    },
    anomalyScore: 0.91, riskLevel: 'high',
    processingLog: [
      { action: 'Invoice Uploaded', details: 'File: TechCorp-Invoice-0155-wrong.pdf', status: 'info' },
      { action: 'OCR Complete', details: 'Fields: 6/8. Extremely high anomaly score: 0.91', status: 'warning' },
      { action: 'Fields Saved', details: '6 fields verified.', status: 'info' },
      { action: 'Matching Complete', details: 'Score: 18% | Status: review_required | Amount $25,000 vs PO $14,105. Wrong line items — furniture instead of server hardware.', status: 'error' },
      { action: 'Invoice Rejected', details: 'Rejected by admin: Wrong invoice submitted — this is for a different client. Please resubmit INV-TC-2026-0141 for PO-TECH-001.', status: 'error' }
    ],
    createdBy: admin._id
  });
  console.log('  [12/12] REJECTED — TechCorp-Invoice-0155, completely wrong items ($25k furniture vs $14k server hardware, anomaly 0.91)');

  await mongoose.disconnect();

  console.log(`
═══════════════════════════════════════════════════════════════════
  STRESS TEST DATA READY
═══════════════════════════════════════════════════════════════════

  Logins:
    admin@company.com        / admin123
    accountant@company.com   / accountant123
    viewer@company.com       / viewer123

  Vendors (3):  Acme Supplies Pvt Ltd | TechCorp Solutions | Global Services LLC

  Purchase Orders (9):
    Acme:    PO-ACME-001 (₹56,640 approved)  PO-ACME-002 (₹56,640 closed)  PO-ACME-003 (₹22,400 draft)
    TechCorp: PO-TECH-001 ($14,105 approved)  PO-TECH-002 ($10,500 approved) PO-TECH-003 ($7,540.75 approved)
    Global:  PO-GLOB-001 ($2,400 approved)   PO-GLOB-002 ($5,000 approved)  PO-GLOB-003 ($10,800 draft)

  Invoices (12):
    STATUS            FILE                            SCENARIO
    ─────────────────────────────────────────────────────────────────────
    uploaded          Acme-Invoice-001                Normal, click Start OCR
    uploaded          Acme-Invoice-001-DUPLICATE      Same invoice# → duplicate detection
    ocr_extracted     TechCorp-Invoice-0141           OCR typo in vendorName, low anomaly
    ocr_extracted     Global-Invoice-055-scan         Poor confidence (44%), 4/8 fields, medium anomaly
    pending_review    GlobalServices-Invoice-031      All fields verified, ready to match
    pending_review    TechCorp-Invoice-0301           2 field corrections logged (OCR artifacts)
    passed            Acme-Invoice-002                97% match, vendorName corrected
    passed            Global-Invoice-042              88% match, amount rounding diff, re-matched once
    review_required   TechCorp-Invoice-0189           $1,500 overcharge + unauthorized line item, high anomaly
    review_required   TechCorp-Invoice-0222           Currency mismatch INR vs USD, very high anomaly
    review_required   Acme-Invoice-099-noPO           No PO linked — fail-closed, score 0%
    rejected          TechCorp-Invoice-0155           Wrong items entirely, highest anomaly (0.91)
═══════════════════════════════════════════════════════════════════
`);
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
