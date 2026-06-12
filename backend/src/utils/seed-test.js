/**
 * Comprehensive test seed script.
 * Creates 3 vendors, 9 purchase orders (3 per vendor), 5 mock invoices
 * covering every status in the pipeline so all UI flows can be tested.
 *
 * Run: node src/utils/seed-test.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const fs = require('fs');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');

const User = require('../models/User');
const Vendor = require('../models/Vendor');
const PurchaseOrder = require('../models/PurchaseOrder');
const Invoice = require('../models/Invoice');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── PDF builder ─────────────────────────────────────────────────────────────

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

function fileHash(filepath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filepath)).digest('hex');
}

// ─── Main seed ────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/invoice-automation');
  console.log('Connected to MongoDB');

  // ── Wipe existing data ──────────────────────────────────────────────────────
  await Promise.all([
    User.deleteMany({}),
    Vendor.deleteMany({}),
    PurchaseOrder.deleteMany({}),
    Invoice.deleteMany({})
  ]);
  console.log('Cleared existing data');

  // ── Admin user ──────────────────────────────────────────────────────────────
  const admin = await User.create({
    name: 'Admin User',
    email: 'admin@company.com',
    password: 'admin123',
    role: 'admin'
  });
  console.log('Created user: admin@company.com / admin123');

  // ══════════════════════════════════════════════════════════════════════════
  // VENDORS  (3 — each with a distinct required-fields configuration)
  // ══════════════════════════════════════════════════════════════════════════

  const [acme, techcorp, global] = await Vendor.create([
    {
      name: 'Acme Supplies Pvt Ltd',
      email: 'billing@acmesupplies.in',
      phone: '+91-98765-43210',
      taxId: '27AABCA1234A1Z5',   // Indian GSTIN
      registrationNumber: 'MH-REG-20210045',
      paymentTerms: 'Net 30',
      status: 'active',
      address: { street: '12, Commerce Park', city: 'Mumbai', state: 'Maharashtra', country: 'India', zipCode: '400001' },
      requiredFields: [
        { fieldKey: 'vendorName',    fieldLabel: 'Vendor Name' },
        { fieldKey: 'gstNumber',     fieldLabel: 'GST Number' },
        { fieldKey: 'invoiceNumber', fieldLabel: 'Invoice Number' },
        { fieldKey: 'poNumber',      fieldLabel: 'PO Number' },
        { fieldKey: 'invoiceDate',   fieldLabel: 'Invoice Date' },
        { fieldKey: 'totalAmount',   fieldLabel: 'Total Amount' },
        { fieldKey: 'taxAmount',     fieldLabel: 'Tax Amount' }
      ]
    },
    {
      name: 'TechCorp Solutions',
      email: 'accounts@techcorp.com',
      phone: '+1-415-555-0100',
      taxId: 'TC-EIN-82-1234567',
      registrationNumber: 'CA-CORP-54321',
      paymentTerms: 'Net 15',
      status: 'active',
      address: { street: '500 Market St', city: 'San Francisco', state: 'CA', country: 'USA', zipCode: '94105' },
      requiredFields: [
        { fieldKey: 'vendorName',    fieldLabel: 'Vendor Name' },
        { fieldKey: 'invoiceNumber', fieldLabel: 'Invoice Number' },
        { fieldKey: 'poNumber',      fieldLabel: 'PO Number' },
        { fieldKey: 'invoiceDate',   fieldLabel: 'Invoice Date' },
        { fieldKey: 'totalAmount',   fieldLabel: 'Total Amount' },
        { fieldKey: 'subTotal',      fieldLabel: 'Subtotal' },
        { fieldKey: 'currency',      fieldLabel: 'Currency' }
      ]
    },
    {
      name: 'Global Services LLC',
      email: 'finance@globalservices.io',
      phone: '+1-512-555-0200',
      taxId: 'GS-EIN-47-9876543',
      registrationNumber: 'TX-LLC-99876',
      paymentTerms: 'Net 60',
      status: 'active',
      address: { street: '300 Congress Ave', city: 'Austin', state: 'TX', country: 'USA', zipCode: '78701' },
      requiredFields: [
        { fieldKey: 'vendorName',    fieldLabel: 'Vendor Name' },
        { fieldKey: 'invoiceNumber', fieldLabel: 'Invoice Number' },
        { fieldKey: 'invoiceDate',   fieldLabel: 'Invoice Date' },
        { fieldKey: 'dueDate',       fieldLabel: 'Due Date' },
        { fieldKey: 'totalAmount',   fieldLabel: 'Total Amount' },
        { fieldKey: 'bankAccount',   fieldLabel: 'Bank Account' }
      ]
    }
  ]);
  console.log(`Created 3 vendors: ${acme.name} | ${techcorp.name} | ${global.name}`);

  // ══════════════════════════════════════════════════════════════════════════
  // PURCHASE ORDERS  (3 per vendor = 9 total)
  // ══════════════════════════════════════════════════════════════════════════

  // Acme POs (INR)
  const acmePO1 = await PurchaseOrder.create({
    vendor: acme._id, currency: 'INR', status: 'approved', createdBy: admin._id,
    issueDate: new Date('2026-04-01'), expectedDelivery: new Date('2026-04-30'),
    poNumber: 'PO-ACME-001',
    notes: 'Office furniture and computer setup for Mumbai office',
    lineItems: [
      { description: 'Ergonomic Office Chair',        quantity: 20, unitPrice: 1200, totalPrice: 24000 },
      { description: 'Standing Desk (Height Adjust)', quantity: 10, unitPrice: 1500, totalPrice: 15000 },
      { description: 'Dell Monitor 24 inch',          quantity: 10, unitPrice: 900,  totalPrice: 9000  }
    ],
    subTotal: 48000, taxRate: 18, tax: 8640, totalAmount: 56640
  });

  const acmePO2 = await PurchaseOrder.create({
    vendor: acme._id, currency: 'INR', status: 'approved', createdBy: admin._id,
    issueDate: new Date('2026-04-15'), expectedDelivery: new Date('2026-05-15'),
    poNumber: 'PO-ACME-002',
    notes: 'IT hardware refresh — laptops and accessories',
    lineItems: [
      { description: 'Laptop HP EliteBook 840',  quantity: 5,  unitPrice: 8500, totalPrice: 42500 },
      { description: 'Wireless Mouse + Keyboard', quantity: 5,  unitPrice: 350,  totalPrice: 1750  },
      { description: 'Laptop Bag 15 inch',        quantity: 5,  unitPrice: 750,  totalPrice: 3750  }
    ],
    subTotal: 48000, taxRate: 18, tax: 8640, totalAmount: 56640
  });

  const acmePO3 = await PurchaseOrder.create({
    vendor: acme._id, currency: 'INR', status: 'draft', createdBy: admin._id,
    issueDate: new Date('2026-05-01'),
    poNumber: 'PO-ACME-003',
    notes: 'Stationery and printing consumables Q2',
    lineItems: [
      { description: 'A4 Paper Ream (500 sheets)', quantity: 50, unitPrice: 220, totalPrice: 11000 },
      { description: 'Printer Ink Cartridge Set',   quantity: 10, unitPrice: 650, totalPrice: 6500  },
      { description: 'Stapler + Pins Bundle',       quantity: 20, unitPrice: 125, totalPrice: 2500  }
    ],
    subTotal: 20000, taxRate: 12, tax: 2400, totalAmount: 22400
  });

  // TechCorp POs (USD)
  const techPO1 = await PurchaseOrder.create({
    vendor: techcorp._id, currency: 'USD', status: 'approved', createdBy: admin._id,
    issueDate: new Date('2026-03-10'), expectedDelivery: new Date('2026-04-10'),
    poNumber: 'PO-TECH-001',
    notes: 'Server hardware for data center expansion',
    lineItems: [
      { description: 'Dell PowerEdge R740 Server', quantity: 2, unitPrice: 4500, totalPrice: 9000  },
      { description: 'RAM DDR4 32GB ECC',           quantity: 8, unitPrice: 350,  totalPrice: 2800  },
      { description: 'SSD 2TB NVMe',               quantity: 4, unitPrice: 300,  totalPrice: 1200  }
    ],
    subTotal: 13000, taxRate: 8.5, tax: 1105, totalAmount: 14105
  });

  const techPO2 = await PurchaseOrder.create({
    vendor: techcorp._id, currency: 'USD', status: 'approved', createdBy: admin._id,
    issueDate: new Date('2026-04-01'), expectedDelivery: new Date('2026-04-20'),
    poNumber: 'PO-TECH-002',
    notes: 'Software licenses — annual renewal',
    lineItems: [
      { description: 'Microsoft 365 Business - Annual (50 seats)', quantity: 50, unitPrice: 150, totalPrice: 7500 },
      { description: 'Adobe Creative Cloud - Team License',        quantity: 5,  unitPrice: 600, totalPrice: 3000 }
    ],
    subTotal: 10500, taxRate: 0, tax: 0, totalAmount: 10500
  });

  const techPO3 = await PurchaseOrder.create({
    vendor: techcorp._id, currency: 'USD', status: 'approved', createdBy: admin._id,
    issueDate: new Date('2026-05-05'),
    poNumber: 'PO-TECH-003',
    notes: 'Network infrastructure — switches and cabling',
    lineItems: [
      { description: 'Cisco Catalyst 2960 Switch (48-port)', quantity: 3, unitPrice: 1800, totalPrice: 5400 },
      { description: 'Cat6 Cable 100m Reel',                  quantity: 10, unitPrice: 80,   totalPrice: 800  },
      { description: 'Patch Panel 48-port',                   quantity: 3,  unitPrice: 250,  totalPrice: 750  }
    ],
    subTotal: 6950, taxRate: 8.5, tax: 590.75, totalAmount: 7540.75
  });

  // Global Services POs (USD)
  const globalPO1 = await PurchaseOrder.create({
    vendor: global._id, currency: 'USD', status: 'approved', createdBy: admin._id,
    issueDate: new Date('2026-02-01'), expectedDelivery: new Date('2026-03-01'),
    poNumber: 'PO-GLOB-001',
    notes: 'Cloud infrastructure — annual subscriptions',
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
    poNumber: 'PO-GLOB-002',
    notes: 'Security audit and penetration testing services',
    lineItems: [
      { description: 'External Security Audit - 5 days',   quantity: 5,  unitPrice: 800, totalPrice: 4000 },
      { description: 'Penetration Testing Report',         quantity: 1,  unitPrice: 500, totalPrice: 500  },
      { description: 'Remediation Consultation - 2 hours', quantity: 2,  unitPrice: 250, totalPrice: 500  }
    ],
    subTotal: 5000, taxRate: 0, tax: 0, totalAmount: 5000
  });

  const globalPO3 = await PurchaseOrder.create({
    vendor: global._id, currency: 'USD', status: 'draft', createdBy: admin._id,
    issueDate: new Date('2026-05-20'),
    poNumber: 'PO-GLOB-003',
    notes: 'SaaS tool licenses for engineering team',
    lineItems: [
      { description: 'GitHub Enterprise - 30 seats', quantity: 30, unitPrice: 210, totalPrice: 6300 },
      { description: 'Figma Organization - 10 seats', quantity: 10, unitPrice: 450, totalPrice: 4500 }
    ],
    subTotal: 10800, taxRate: 0, tax: 0, totalAmount: 10800
  });

  console.log('Created 9 purchase orders (3 per vendor)');

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICES — 5 mock invoices covering every status
  // ══════════════════════════════════════════════════════════════════════════

  // ── Invoice 1: UPLOADED ──────────────────────────────────────────────────
  // Acme → PO-ACME-001. Correct data. User will click "Start OCR" to process.
  const inv1File = `invoice-seed-001-${Date.now()}.pdf`;
  const inv1Path = path.join(UPLOADS_DIR, inv1File);
  await writePDF(inv1Path, [
    { text: 'TAX INVOICE', size: 22, bold: true, gap: 0.5 },
    { text: '------------------------------------------', size: 10 },
    { text: 'Vendor: Acme Supplies Pvt Ltd', size: 12, gap: 0 },
    { text: 'Address: 12, Commerce Park, Mumbai, Maharashtra, India', size: 10 },
    { text: 'GSTIN: 27AABCA1234A1Z5', size: 12 },
    { text: '------------------------------------------', size: 10 },
    { text: 'Invoice Number: INV-ACME-2026-001', size: 12 },
    { text: 'Invoice Date: 02/06/2026', size: 12 },
    { text: 'Due Date: 02/07/2026', size: 12 },
    { text: 'PO Number: PO-ACME-001', size: 12, gap: 0.5 },
    { text: 'Bill To: Your Company Name', size: 10, gap: 0.5 },
    { text: '------------------------------------------', size: 10 },
    { text: 'ITEM DETAILS', size: 11, bold: true },
    { text: 'Ergonomic Office Chair      x20   @1200   24000.00', size: 10 },
    { text: 'Standing Desk (Height Adj)  x10   @1500   15000.00', size: 10 },
    { text: 'Dell Monitor 24 inch        x10   @900     9000.00', size: 10, gap: 0.5 },
    { text: '------------------------------------------', size: 10 },
    { text: 'Subtotal:           Rs.48000.00', size: 12 },
    { text: 'Tax (GST 18%):      Rs.8640.00', size: 12 },
    { text: 'Total Amount:       Rs.56640.00', size: 14, bold: true, gap: 0.5 },
    { text: 'Currency: INR', size: 11 },
    { text: 'Bank Account: 50200045678901', size: 11 },
    { text: 'Bank: HDFC Bank, IFSC: HDFC0001234', size: 10 },
    { text: 'Thank you for your business!', size: 10 }
  ]);

  const inv1 = await Invoice.create({
    status: 'uploaded',
    vendor: acme._id,
    purchaseOrder: acmePO1._id,
    uploadedFile: {
      filename: inv1File,
      originalName: 'Acme-Invoice-001.pdf',
      mimetype: 'application/pdf',
      path: `uploads/${inv1File}`,
      size: fs.statSync(inv1Path).size,
      hash: fileHash(inv1Path)
    },
    processingLog: [
      { action: 'Invoice Uploaded', details: 'File: Acme-Invoice-001.pdf. Ready for OCR.', status: 'info' }
    ],
    createdBy: admin._id
  });
  console.log(`  [1/5] Invoice UPLOADED — ${inv1File} (Acme → PO-ACME-001)`);

  // ── Invoice 2: OCR_EXTRACTED ─────────────────────────────────────────────
  // TechCorp → PO-TECH-001. OCR already ran. User sees split-view to verify.
  // One field has a minor OCR error (vendor name has a typo).
  const inv2File = `invoice-seed-002-${Date.now()}.pdf`;
  const inv2Path = path.join(UPLOADS_DIR, inv2File);
  await writePDF(inv2Path, [
    { text: 'INVOICE', size: 22, bold: true, gap: 0.5 },
    { text: 'From: TechCorp Solutions', size: 12 },
    { text: '500 Market St, San Francisco, CA 94105, USA', size: 10 },
    { text: 'Seller: TechCorp Solutions', size: 11, gap: 0.5 },
    { text: 'Invoice Number: INV-TC-2026-0141', size: 12 },
    { text: 'Invoice Date: 20/03/2026', size: 12 },
    { text: 'PO Number: PO-TECH-001', size: 12 },
    { text: 'Currency: USD', size: 11, gap: 0.5 },
    { text: 'Dell PowerEdge R740 Server  x2  @4500   9000.00', size: 10 },
    { text: 'RAM DDR4 32GB ECC           x8   @350   2800.00', size: 10 },
    { text: 'SSD 2TB NVMe               x4   @300   1200.00', size: 10, gap: 0.5 },
    { text: 'Subtotal:          $13000.00', size: 12 },
    { text: 'Tax (8.5%):         $1105.00', size: 12 },
    { text: 'Total Amount:      $14105.00', size: 14, bold: true },
    { text: 'Payment due within 15 days of receipt', size: 10 }
  ]);

  const inv2 = await Invoice.create({
    status: 'ocr_extracted',
    vendor: techcorp._id,
    purchaseOrder: techPO1._id,
    invoiceNumber: 'INV-TC-2026-0141',
    uploadedFile: {
      filename: inv2File,
      originalName: 'TechCorp-Invoice-0141.pdf',
      mimetype: 'application/pdf',
      path: `uploads/${inv2File}`,
      size: fs.statSync(inv2Path).size,
      hash: fileHash(inv2Path)
    },
    ocrText: 'INVOICE\nFrom: TechCorp Solutions\n500 Market St, San Francisco, CA 94105, USA\nSeller: TechCorp Solutions\nInvoice Number: INV-TC-2026-0141\nInvoice Date: 20/03/2026\nPO Number: PO-TECH-001\nCurrency: USD\nDell PowerEdge R740 Server  x2  @4500   9000.00\nRAM DDR4 32GB ECC           x8   @350   2800.00\nSSD 2TB NVMe               x4   @300   1200.00\nSubtotal:          $13000.00\nTax (8.5%):         $1105.00\nTotal Amount:      $14105.00',
    extractedData: {
      vendorName:    { value: 'TechCorp Soiutions', confidence: 68 },  // OCR typo: 'l' → 'i'
      invoiceNumber: { value: 'INV-TC-2026-0141',   confidence: 92 },
      poNumber:      { value: 'PO-TECH-001',         confidence: 90 },
      invoiceDate:   { value: '20/03/2026',           confidence: 87 },
      currency:      { value: 'USD',                  confidence: 95 },
      subTotal:      { value: 13000,                  confidence: 88 },
      tax:           { value: 1105,                   confidence: 85 },
      totalAmount:   { value: 14105,                  confidence: 91 },
      gstNumber:     { value: null,                   confidence: 0  },
      dueDate:       { value: null,                   confidence: 0  },
      bankAccount:   { value: null,                   confidence: 0  },
      lineItems: [
        { description: 'Dell PowerEdge R740 Server', quantity: 2, unitPrice: 4500, totalPrice: 9000,  confidence: 80 },
        { description: 'RAM DDR4 32GB ECC',           quantity: 8, unitPrice: 350,  totalPrice: 2800,  confidence: 78 },
        { description: 'SSD 2TB NVMe',               quantity: 4, unitPrice: 300,  totalPrice: 1200,  confidence: 75 }
      ],
      overallConfidence: 83, extractedFieldCount: 6, totalFields: 8
    },
    processingLog: [
      { action: 'Invoice Uploaded', details: 'File: TechCorp-Invoice-0141.pdf', status: 'info' },
      { action: 'OCR Complete', details: 'Extracted 412 chars via pdf-parse (confidence: 90%). Fields found: 6/8', status: 'success' }
    ],
    createdBy: admin._id
  });
  console.log(`  [2/5] Invoice OCR_EXTRACTED — vendorName has OCR typo for user to fix (TechCorp → PO-TECH-001)`);

  // ── Invoice 3: PENDING_REVIEW ────────────────────────────────────────────
  // Global Services → PO-GLOB-001. User already verified fields, ready to match.
  const inv3File = `invoice-seed-003-${Date.now()}.pdf`;
  const inv3Path = path.join(UPLOADS_DIR, inv3File);
  await writePDF(inv3Path, [
    { text: 'SERVICE INVOICE', size: 20, bold: true, gap: 0.5 },
    { text: 'Vendor: Global Services LLC', size: 12 },
    { text: '300 Congress Ave, Austin, TX 78701, USA', size: 10, gap: 0.5 },
    { text: 'Invoice Number: INV-GLOB-2026-031', size: 12 },
    { text: 'Invoice Date: 05/02/2026', size: 12 },
    { text: 'Due Date: 06/04/2026', size: 12 },
    { text: 'PO Number: PO-GLOB-001', size: 12, gap: 0.5 },
    { text: 'AWS EC2 Reserved Instance  x1  @1200  $1200.00', size: 10 },
    { text: 'Cloudflare Pro Plan        x1   @240   $240.00', size: 10 },
    { text: 'Datadog APM - 12 months   x1   @960   $960.00', size: 10, gap: 0.5 },
    { text: 'Subtotal:        $2400.00', size: 12 },
    { text: 'Tax:             $0.00', size: 12 },
    { text: 'Total Amount:    $2400.00', size: 14, bold: true },
    { text: 'Account Number: 3456789012', size: 11 },
    { text: 'Bank: Chase Bank, Routing: 021000021', size: 10 }
  ]);

  const inv3 = await Invoice.create({
    status: 'pending_review',
    vendor: global._id,
    purchaseOrder: globalPO1._id,
    invoiceNumber: 'INV-GLOB-2026-031',
    uploadedFile: {
      filename: inv3File,
      originalName: 'GlobalServices-Invoice-031.pdf',
      mimetype: 'application/pdf',
      path: `uploads/${inv3File}`,
      size: fs.statSync(inv3Path).size,
      hash: fileHash(inv3Path)
    },
    ocrText: 'SERVICE INVOICE\nVendor: Global Services LLC\n300 Congress Ave, Austin, TX 78701\nInvoice Number: INV-GLOB-2026-031\nInvoice Date: 05/02/2026\nDue Date: 06/04/2026\nPO Number: PO-GLOB-001\nSubtotal: $2400.00\nTax: $0.00\nTotal Amount: $2400.00\nAccount Number: 3456789012',
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
      lineItems: [],
      overallConfidence: 87, extractedFieldCount: 8, totalFields: 8
    },
    userVerifiedData: {
      vendorName:    'Global Services LLC',
      invoiceNumber: 'INV-GLOB-2026-031',
      invoiceDate:   '05/02/2026',
      dueDate:       '06/04/2026',
      totalAmount:   2400,
      bankAccount:   '3456789012',
      poNumber:      'PO-GLOB-001'
    },
    processingLog: [
      { action: 'Invoice Uploaded',   details: 'File: GlobalServices-Invoice-031.pdf', status: 'info' },
      { action: 'OCR Complete',       details: 'Extracted 310 chars via pdf-parse. Fields found: 8/8', status: 'success' },
      { action: 'Fields Saved',       details: 'User verified and saved 7 field(s)', status: 'info' }
    ],
    createdBy: admin._id
  });
  console.log(`  [3/5] Invoice PENDING_REVIEW — all fields verified, ready to submit for matching (Global → PO-GLOB-001)`);

  // ── Invoice 4: PASSED ────────────────────────────────────────────────────
  // Acme → PO-ACME-002. Full pipeline complete. Match score 97%.
  const inv4File = `invoice-seed-004-${Date.now()}.pdf`;
  const inv4Path = path.join(UPLOADS_DIR, inv4File);
  await writePDF(inv4Path, [
    { text: 'TAX INVOICE', size: 22, bold: true, gap: 0.5 },
    { text: 'Vendor: Acme Supplies Pvt Ltd', size: 12 },
    { text: '12, Commerce Park, Mumbai, Maharashtra, India', size: 10 },
    { text: 'GSTIN: 27AABCA1234A1Z5', size: 12, gap: 0.5 },
    { text: 'Invoice Number: INV-ACME-2026-002', size: 12 },
    { text: 'Invoice Date: 20/04/2026', size: 12 },
    { text: 'PO Number: PO-ACME-002', size: 12, gap: 0.5 },
    { text: 'Laptop HP EliteBook 840   x5  @8500  42500.00', size: 10 },
    { text: 'Wireless Mouse + Keyboard x5   @350   1750.00', size: 10 },
    { text: 'Laptop Bag 15 inch        x5   @750   3750.00', size: 10, gap: 0.5 },
    { text: 'Subtotal:   Rs.48000.00', size: 12 },
    { text: 'GST: Rs.8640.00', size: 12 },
    { text: 'Total Amount: Rs.56640.00', size: 14, bold: true },
    { text: 'Currency: INR', size: 11 },
    { text: 'Account Number: 50200045678901', size: 11 },
    { text: 'Payment terms: Net 30 days', size: 10 }
  ]);

  const inv4 = await Invoice.create({
    status: 'passed',
    vendor: acme._id,
    purchaseOrder: acmePO2._id,
    invoiceNumber: 'INV-ACME-2026-002',
    uploadedFile: {
      filename: inv4File,
      originalName: 'Acme-Invoice-002.pdf',
      mimetype: 'application/pdf',
      path: `uploads/${inv4File}`,
      size: fs.statSync(inv4Path).size,
      hash: fileHash(inv4Path)
    },
    ocrText: 'TAX INVOICE\nVendor: Acme Supplies Pvt Ltd\nGSTIN: 27AABCA1234A1Z5\nInvoice Number: INV-ACME-2026-002\nInvoice Date: 20/04/2026\nPO Number: PO-ACME-002\nSubtotal: Rs.48000.00\nGST: Rs.8640.00\nTotal Amount: Rs.56640.00\nCurrency: INR',
    extractedData: {
      vendorName:    { value: 'Acme Supplies Pvt Ltd', confidence: 85 },
      gstNumber:     { value: '27AABCA1234A1Z5',       confidence: 95 },
      invoiceNumber: { value: 'INV-ACME-2026-002',      confidence: 92 },
      poNumber:      { value: 'PO-ACME-002',            confidence: 90 },
      invoiceDate:   { value: '20/04/2026',              confidence: 88 },
      dueDate:       { value: null,                      confidence: 0  },
      totalAmount:   { value: 56640,                     confidence: 91 },
      subTotal:      { value: 48000,                     confidence: 89 },
      tax:           { value: 8640,                      confidence: 87 },
      currency:      { value: 'INR',                     confidence: 92 },
      bankAccount:   { value: '50200045678901',          confidence: 80 },
      lineItems: [
        { description: 'Laptop HP EliteBook 840',   quantity: 5, unitPrice: 8500, totalPrice: 42500, confidence: 82 },
        { description: 'Wireless Mouse + Keyboard', quantity: 5, unitPrice: 350,  totalPrice: 1750,  confidence: 78 },
        { description: 'Laptop Bag 15 inch',        quantity: 5, unitPrice: 750,  totalPrice: 3750,  confidence: 80 }
      ],
      overallConfidence: 89, extractedFieldCount: 8, totalFields: 8
    },
    userVerifiedData: {
      vendorName:    'Acme Supplies Pvt Ltd',
      gstNumber:     '27AABCA1234A1Z5',
      invoiceNumber: 'INV-ACME-2026-002',
      poNumber:      'PO-ACME-002',
      invoiceDate:   '20/04/2026',
      totalAmount:   56640,
      taxAmount:     8640
    },
    fieldChanges: [
      {
        field:     'vendorName',
        oldValue:  'Acme Supplies',
        newValue:  'Acme Supplies Pvt Ltd',
        changedBy: admin._id,
        changedAt: new Date('2026-04-21T10:30:00Z')
      }
    ],
    validationResult: {
      status:      'passed',
      matchScore:  97,
      discrepancies: [],
      duplicateCheck: { isDuplicate: false, similarInvoiceId: null }
    },
    processingLog: [
      { action: 'Invoice Uploaded',   details: 'File: Acme-Invoice-002.pdf',                         status: 'info'    },
      { action: 'OCR Complete',       details: 'Extracted 385 chars via pdf-parse. Fields found: 8/8', status: 'success' },
      { action: 'Fields Saved',       details: 'User verified and saved 7 field(s)',                   status: 'info'    },
      { action: 'Matching Complete',  details: 'Score: 97% | Status: passed | Discrepancies: 0',       status: 'success' }
    ],
    createdBy: admin._id
  });
  console.log(`  [4/5] Invoice PASSED — match score 97% with 1 field correction logged (Acme → PO-ACME-002)`);

  // ── Invoice 5: REVIEW_REQUIRED ───────────────────────────────────────────
  // TechCorp → PO-TECH-002. Wrong total amount — vendor overcharged.
  const inv5File = `invoice-seed-005-${Date.now()}.pdf`;
  const inv5Path = path.join(UPLOADS_DIR, inv5File);
  await writePDF(inv5Path, [
    { text: 'INVOICE', size: 22, bold: true, gap: 0.5 },
    { text: 'From: TechCorp Solutions', size: 12 },
    { text: '500 Market St, San Francisco, CA 94105, USA', size: 10, gap: 0.5 },
    { text: 'Invoice Number: INV-TC-2026-0189', size: 12 },
    { text: 'Invoice Date: 10/04/2026', size: 12 },
    { text: 'PO Number: PO-TECH-002', size: 12 },
    { text: 'Currency: USD', size: 11, gap: 0.5 },
    { text: 'Microsoft 365 Business - 50 seats  x50  @150  7500.00', size: 10 },
    { text: 'Adobe Creative Cloud Team License   x5   @600  3000.00', size: 10 },
    { text: 'Setup & Configuration Fee  (NOT IN PO)', size: 9 },
    { text: 'Setup Fee:                          x1  @1500  1500.00', size: 10, gap: 0.5 },
    { text: 'Subtotal:     $12000.00', size: 12 },
    { text: 'Tax:             $0.00', size: 12 },
    { text: 'Total Amount: $12000.00', size: 14, bold: true },
    { text: '(PO was for $10,500.00 — discrepancy of $1,500)', size: 9 },
    { text: 'Payment terms: Net 15 days', size: 10 }
  ]);

  const inv5 = await Invoice.create({
    status: 'review_required',
    vendor: techcorp._id,
    purchaseOrder: techPO2._id,
    invoiceNumber: 'INV-TC-2026-0189',
    uploadedFile: {
      filename: inv5File,
      originalName: 'TechCorp-Invoice-0189.pdf',
      mimetype: 'application/pdf',
      path: `uploads/${inv5File}`,
      size: fs.statSync(inv5Path).size,
      hash: fileHash(inv5Path)
    },
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
      gstNumber:     { value: null, confidence: 0 },
      dueDate:       { value: null, confidence: 0 },
      bankAccount:   { value: null, confidence: 0 },
      lineItems: [],
      overallConfidence: 90, extractedFieldCount: 6, totalFields: 8
    },
    userVerifiedData: {
      vendorName:    'TechCorp Solutions',
      invoiceNumber: 'INV-TC-2026-0189',
      poNumber:      'PO-TECH-002',
      invoiceDate:   '10/04/2026',
      totalAmount:   12000,
      subTotal:      12000,
      currency:      'USD'
    },
    validationResult: {
      status:     'review_required',
      matchScore: 42,
      discrepancies: [
        {
          field:    'totalAmount',
          expected: 10500,
          actual:   12000,
          severity: 'high'
        },
        {
          field:    'subTotal',
          expected: 10500,
          actual:   12000,
          severity: 'medium'
        }
      ],
      duplicateCheck: { isDuplicate: false, similarInvoiceId: null }
    },
    processingLog: [
      { action: 'Invoice Uploaded',   details: 'File: TechCorp-Invoice-0189.pdf',                        status: 'info'    },
      { action: 'OCR Complete',       details: 'Extracted 298 chars via pdf-parse. Fields found: 6/8',    status: 'success' },
      { action: 'Fields Saved',       details: 'User verified and saved 7 field(s)',                      status: 'info'    },
      { action: 'Matching Complete',  details: 'Score: 42% | Status: review_required | Discrepancies: 2', status: 'warning' }
    ],
    createdBy: admin._id
  });
  console.log(`  [5/5] Invoice REVIEW_REQUIRED — totalAmount $12,000 vs PO $10,500 (+$1,500 overcharge) (TechCorp → PO-TECH-002)`);

  await mongoose.disconnect();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  TEST DATA READY');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Login:  admin@company.com  /  admin123');
  console.log('\n  Vendors (3):');
  console.log('    • Acme Supplies Pvt Ltd   — 7 required fields (incl. GST)');
  console.log('    • TechCorp Solutions       — 7 required fields (USD)');
  console.log('    • Global Services LLC      — 6 required fields (incl. bank)');
  console.log('\n  Purchase Orders (9):');
  console.log('    Acme:    PO-ACME-001 (₹56,640)  PO-ACME-002 (₹56,640)  PO-ACME-003 (₹22,400)');
  console.log('    TechCorp: PO-TECH-001 ($14,105)  PO-TECH-002 ($10,500)  PO-TECH-003 ($7,540.75)');
  console.log('    Global:  PO-GLOB-001 ($2,400)   PO-GLOB-002 ($5,000)   PO-GLOB-003 ($10,800)');
  console.log('\n  Invoices (5) — one at each stage:');
  console.log('    1. UPLOADED       — Click "Start OCR" to process  (Acme → PO-ACME-001)');
  console.log('    2. OCR_EXTRACTED  — Fix OCR typo in vendorName    (TechCorp → PO-TECH-001)');
  console.log('    3. PENDING_REVIEW — Click "Submit for Matching"   (Global → PO-GLOB-001)');
  console.log('    4. PASSED         — Fully processed, 97% match    (Acme → PO-ACME-002)');
  console.log('    5. REVIEW_REQUIRED — $1,500 overcharge detected   (TechCorp → PO-TECH-002)');
  console.log('═══════════════════════════════════════════════════════\n');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
