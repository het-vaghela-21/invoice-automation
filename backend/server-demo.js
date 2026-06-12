/**
 * Demo server — runs without MongoDB using in-memory store
 * Implements the same REST API as the production server
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const cors = require('cors');
const { extractText } = require('./src/services/ocrService');
const { extractInvoiceData } = require('./src/services/extractionService');

require('dotenv').config();

const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const JWT_SECRET = process.env.JWT_SECRET || 'invoice_automation_demo_secret';

// ===================== IN-MEMORY STORE =====================
const db = {
  users: [],
  vendors: [],
  purchaseOrders: [],
  invoices: []
};

const newId = () => crypto.randomBytes(12).toString('hex');

// Seed demo data
async function seed() {
  const hash = await bcrypt.hash('admin123', 10);
  const user = { _id: newId(), name: 'Admin User', email: 'admin@company.com', password: hash, role: 'admin', createdAt: new Date() };
  db.users.push(user);

  const vendors = [
    { _id: newId(), name: 'TechSupply Corp', email: 'billing@techsupply.com', phone: '+1-555-0101', taxId: 'TS-2024-001', registrationNumber: 'REG-001', paymentTerms: 'Net 30', status: 'active', address: { street: '100 Tech Ave', city: 'San Francisco', state: 'CA', country: 'USA', zipCode: '94102' }, createdAt: new Date() },
    { _id: newId(), name: 'Office Essentials Ltd', email: 'invoices@officeessentials.com', phone: '+1-555-0202', taxId: 'OE-2024-002', registrationNumber: 'REG-002', paymentTerms: 'Net 15', status: 'active', address: { street: '200 Office Blvd', city: 'New York', state: 'NY', country: 'USA', zipCode: '10001' }, createdAt: new Date() },
    { _id: newId(), name: 'Cloud Services Inc', email: 'accounts@cloudservices.io', phone: '+1-555-0303', taxId: 'CS-2024-003', registrationNumber: 'REG-003', paymentTerms: 'Net 60', status: 'active', address: { street: '300 Cloud St', city: 'Austin', state: 'TX', country: 'USA', zipCode: '73301' }, createdAt: new Date() }
  ];
  db.vendors.push(...vendors);

  const pos = [
    { _id: newId(), poNumber: 'PO-2024-00001', vendor: vendors[0]._id, issueDate: new Date('2024-01-15'), expectedDelivery: new Date('2024-02-15'), lineItems: [{ _id: newId(), description: 'Laptop Computer - Dell XPS 15', quantity: 5, unitPrice: 1500, totalPrice: 7500 }, { _id: newId(), description: 'External Monitor 27"', quantity: 5, unitPrice: 350, totalPrice: 1750 }, { _id: newId(), description: 'USB-C Docking Station', quantity: 5, unitPrice: 150, totalPrice: 750 }], subTotal: 10000, taxRate: 10, tax: 1000, totalAmount: 11000, currency: 'USD', status: 'approved', createdBy: user._id, createdAt: new Date('2024-01-15') },
    { _id: newId(), poNumber: 'PO-2024-00002', vendor: vendors[1]._id, issueDate: new Date('2024-01-20'), expectedDelivery: new Date('2024-02-05'), lineItems: [{ _id: newId(), description: 'Office Chair - Ergonomic', quantity: 10, unitPrice: 250, totalPrice: 2500 }, { _id: newId(), description: 'Standing Desk', quantity: 5, unitPrice: 500, totalPrice: 2500 }], subTotal: 5000, taxRate: 8, tax: 400, totalAmount: 5400, currency: 'USD', status: 'approved', createdBy: user._id, createdAt: new Date('2024-01-20') },
    { _id: newId(), poNumber: 'PO-2024-00003', vendor: vendors[2]._id, issueDate: new Date('2024-02-01'), lineItems: [{ _id: newId(), description: 'Cloud Storage - 1TB Annual', quantity: 1, unitPrice: 1200, totalPrice: 1200 }, { _id: newId(), description: 'Security Suite License - Annual', quantity: 20, unitPrice: 50, totalPrice: 1000 }], subTotal: 2200, taxRate: 0, tax: 0, totalAmount: 2200, currency: 'USD', status: 'approved', createdBy: user._id, createdAt: new Date('2024-02-01') }
  ];
  db.purchaseOrders.push(...pos);

  console.log('Demo data seeded: 1 user, 3 vendors, 3 purchase orders');
  console.log('Login: admin@company.com / admin123');
}

// ===================== HELPERS =====================
const populateVendor = (id) => db.vendors.find(v => v._id === id) || null;
const populatePO = (id) => {
  const po = db.purchaseOrders.find(p => p._id === id);
  if (!po) return null;
  return { ...po, vendor: populateVendor(po.vendor) };
};

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = db.users.find(u => u._id === decoded.id);
    if (!req.user) return res.status(401).json({ success: false, message: 'User not found' });
    next();
  } catch { return res.status(401).json({ success: false, message: 'Invalid token' }); }
};

// ===================== AUTH =====================
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (db.users.find(u => u.email === email)) return res.status(400).json({ success: false, message: 'Email already exists' });
  const hash = await bcrypt.hash(password, 10);
  const user = { _id: newId(), name, email, password: hash, role: role || 'accountant', createdAt: new Date() };
  db.users.push(user);
  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ success: false, message: 'Invalid credentials' });
  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
});

app.get('/api/auth/me', auth, (req, res) => res.json({ success: true, user: req.user }));

// ===================== VENDORS =====================
app.get('/api/vendors', auth, (req, res) => {
  let vendors = [...db.vendors];
  if (req.query.status) vendors = vendors.filter(v => v.status === req.query.status);
  if (req.query.search) { const s = req.query.search.toLowerCase(); vendors = vendors.filter(v => v.name.toLowerCase().includes(s) || v.email.toLowerCase().includes(s)); }
  vendors.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const page = parseInt(req.query.page) || 1, limit = parseInt(req.query.limit) || 20;
  const data = vendors.slice((page-1)*limit, page*limit);
  res.json({ success: true, data, total: vendors.length, page, pages: Math.ceil(vendors.length/limit) });
});

app.get('/api/vendors/:id', auth, (req, res) => {
  const vendor = db.vendors.find(v => v._id === req.params.id);
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
  res.json({ success: true, data: vendor });
});

app.post('/api/vendors', auth, (req, res) => {
  const vendor = { _id: newId(), ...req.body, status: req.body.status || 'active', createdAt: new Date(), updatedAt: new Date() };
  db.vendors.push(vendor);
  res.status(201).json({ success: true, data: vendor });
});

app.put('/api/vendors/:id', auth, (req, res) => {
  const idx = db.vendors.findIndex(v => v._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Vendor not found' });
  db.vendors[idx] = { ...db.vendors[idx], ...req.body, updatedAt: new Date() };
  res.json({ success: true, data: db.vendors[idx] });
});

app.delete('/api/vendors/:id', auth, (req, res) => {
  const idx = db.vendors.findIndex(v => v._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Vendor not found' });
  db.vendors.splice(idx, 1);
  res.json({ success: true, message: 'Vendor deleted' });
});

// ===================== PURCHASE ORDERS =====================
app.get('/api/purchase-orders', auth, (req, res) => {
  let pos = db.purchaseOrders.map(po => ({ ...po, vendor: populateVendor(po.vendor) || po.vendor }));
  if (req.query.vendor) pos = pos.filter(p => (p.vendor._id || p.vendor) === req.query.vendor);
  if (req.query.status) pos = pos.filter(p => p.status === req.query.status);
  pos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const page = parseInt(req.query.page) || 1, limit = parseInt(req.query.limit) || 20;
  res.json({ success: true, data: pos.slice((page-1)*limit, page*limit), total: pos.length, page, pages: Math.ceil(pos.length/limit) });
});

app.get('/api/purchase-orders/:id', auth, (req, res) => {
  const po = populatePO(req.params.id);
  if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
  res.json({ success: true, data: po });
});

app.post('/api/purchase-orders', auth, (req, res) => {
  const { lineItems = [], taxRate = 0, ...rest } = req.body;
  const enrichedItems = lineItems.map(i => ({ _id: newId(), ...i, totalPrice: i.quantity * i.unitPrice }));
  const subTotal = enrichedItems.reduce((s, i) => s + i.totalPrice, 0);
  const tax = subTotal * (taxRate / 100);
  const totalAmount = subTotal + tax;
  const count = db.purchaseOrders.length;
  const po = { _id: newId(), poNumber: `PO-${new Date().getFullYear()}-${String(count+1).padStart(5,'0')}`, ...rest, lineItems: enrichedItems, subTotal, tax, taxRate, totalAmount, createdBy: req.user._id, createdAt: new Date() };
  db.purchaseOrders.push(po);
  res.status(201).json({ success: true, data: { ...po, vendor: populateVendor(po.vendor) } });
});

app.put('/api/purchase-orders/:id', auth, (req, res) => {
  const idx = db.purchaseOrders.findIndex(p => p._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Purchase order not found' });
  db.purchaseOrders[idx] = { ...db.purchaseOrders[idx], ...req.body, updatedAt: new Date() };
  res.json({ success: true, data: { ...db.purchaseOrders[idx], vendor: populateVendor(db.purchaseOrders[idx].vendor) } });
});

// ===================== INVOICES =====================
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `invoice-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  ['application/pdf','image/jpeg','image/jpg','image/png'].includes(file.mimetype) ? cb(null, true) : cb(new Error('Invalid file type'));
}});

function validateAgainstPO(extracted, po) {
  const discrepancies = [];
  let score = 100;
  const vendor = populateVendor(po.vendor._id || po.vendor);

  if (extracted.vendorName?.value && vendor?.name) {
    const n1 = extracted.vendorName.value.toLowerCase().replace(/[^a-z]/g,'');
    const n2 = vendor.name.toLowerCase().replace(/[^a-z]/g,'');
    if (!n1.includes(n2.slice(0,5)) && !n2.includes(n1.slice(0,5))) {
      discrepancies.push({ field: 'vendorName', expected: vendor.name, actual: extracted.vendorName.value, severity: 'high' });
      score -= 20;
    }
  }
  if (extracted.totalAmount?.value != null) {
    const diff = Math.abs(extracted.totalAmount.value - po.totalAmount);
    if (diff > po.totalAmount * 0.05) {
      discrepancies.push({ field: 'totalAmount', expected: po.totalAmount, actual: extracted.totalAmount.value, severity: diff > po.totalAmount * 0.15 ? 'high' : 'medium' });
      score -= Math.min(30, Math.round((diff/po.totalAmount)*100));
    }
  } else {
    discrepancies.push({ field: 'totalAmount', expected: po.totalAmount, actual: null, severity: 'medium' });
    score -= 10;
  }
  if (extracted.currency?.value && extracted.currency.value !== po.currency) {
    discrepancies.push({ field: 'currency', expected: po.currency, actual: extracted.currency.value, severity: 'high' });
    score -= 20;
  }

  score = Math.max(0, score);
  const status = score >= 70 && !discrepancies.some(d => d.severity === 'high') ? 'validated' : 'rejected';
  return { status, matchScore: score, discrepancies };
}

async function processInvoice(invoice) {
  try {
    invoice.status = 'processing';
    invoice.processingLog.push({ timestamp: new Date(), action: 'OCR Started', details: `File: ${invoice.uploadedFile.originalName}`, status: 'info' });

    const filePath = path.join(__dirname, invoice.uploadedFile.path);
    const { text, confidence, method } = await extractText(filePath, invoice.uploadedFile.mimetype);
    invoice.ocrText = text;
    invoice.processingLog.push({ timestamp: new Date(), action: 'OCR Complete', details: `Extracted ${text.length} chars using ${method}, confidence: ${confidence}%`, status: 'success' });

    const extracted = extractInvoiceData(text);
    invoice.extractedData = extracted;
    if (extracted.invoiceNumber?.value) invoice.invoiceNumber = extracted.invoiceNumber.value;
    invoice.processingLog.push({ timestamp: new Date(), action: 'Extraction Complete', details: `Overall confidence: ${extracted.overallConfidence}%`, status: 'success' });

    // Duplicate check
    const isDuplicate = db.invoices.some(inv => inv._id !== invoice._id && (inv.uploadedFile?.hash === invoice.uploadedFile.hash || (invoice.invoiceNumber && inv.invoiceNumber === invoice.invoiceNumber)));
    const duplicateCheck = { isDuplicate, similarInvoiceId: isDuplicate ? db.invoices.find(inv => inv._id !== invoice._id && inv.uploadedFile?.hash === invoice.uploadedFile.hash)?._id : null };

    let validationResult;
    if (invoice.purchaseOrder) {
      const po = populatePO(invoice.purchaseOrder);
      if (po) {
        validationResult = validateAgainstPO(extracted, po);
        validationResult.duplicateCheck = duplicateCheck;
        invoice.processingLog.push({ timestamp: new Date(), action: 'Validation Complete', details: `Match: ${validationResult.matchScore}%, Status: ${validationResult.status}`, status: validationResult.status === 'validated' ? 'success' : 'warning' });
      }
    } else {
      validationResult = { status: isDuplicate ? 'rejected' : 'pending', matchScore: 0, discrepancies: [], duplicateCheck };
      invoice.processingLog.push({ timestamp: new Date(), action: 'Validation Skipped', details: 'No PO linked', status: 'warning' });
    }

    invoice.validationResult = validationResult;
    invoice.status = validationResult.status === 'validated' ? 'validated' : validationResult.status === 'rejected' ? 'rejected' : 'processing';
  } catch (err) {
    invoice.status = 'uploaded';
    invoice.processingLog.push({ timestamp: new Date(), action: 'Processing Error', details: err.message, status: 'error' });
  }
}

app.post('/api/invoices', auth, upload.single('invoice'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const { purchaseOrderId } = req.body;
  const filePath = path.join('uploads', req.file.filename);
  const fileHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, filePath))).digest('hex');
  const po = purchaseOrderId ? db.purchaseOrders.find(p => p._id === purchaseOrderId) : null;

  const invoice = { _id: newId(), status: 'uploaded', invoiceNumber: null, vendor: po?.vendor || null, purchaseOrder: purchaseOrderId || null,
    uploadedFile: { filename: req.file.filename, originalName: req.file.originalname, mimetype: req.file.mimetype, path: filePath, size: req.file.size, hash: fileHash },
    ocrText: '', extractedData: {}, validationResult: { status: 'pending', matchScore: 0, discrepancies: [], duplicateCheck: { isDuplicate: false } },
    processingLog: [{ timestamp: new Date(), action: 'Invoice Uploaded', details: `${req.file.originalname} (${(req.file.size/1024).toFixed(1)} KB)`, status: 'info' }],
    createdBy: req.user._id, createdAt: new Date()
  };
  db.invoices.push(invoice);

  processInvoice(invoice).catch(console.error);
  res.status(201).json({ success: true, message: 'Invoice uploaded and processing started', data: invoice });
});

app.get('/api/invoices', auth, (req, res) => {
  let invoices = db.invoices.map(inv => ({
    ...inv,
    vendor: inv.vendor ? (populateVendor(inv.vendor._id || inv.vendor) || inv.vendor) : null,
    purchaseOrder: inv.purchaseOrder ? (() => { const p = db.purchaseOrders.find(p => p._id === inv.purchaseOrder); return p ? { _id: p._id, poNumber: p.poNumber, totalAmount: p.totalAmount } : null; })() : null,
    ocrText: undefined, processingLog: undefined
  }));
  if (req.query.status) invoices = invoices.filter(i => i.status === req.query.status);
  invoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const page = parseInt(req.query.page)||1, limit = parseInt(req.query.limit)||20;
  res.json({ success: true, data: invoices.slice((page-1)*limit, page*limit), total: invoices.length, page, pages: Math.ceil(invoices.length/limit) });
});

app.get('/api/invoices/:id', auth, (req, res) => {
  const inv = db.invoices.find(i => i._id === req.params.id);
  if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found' });
  const populated = {
    ...inv,
    vendor: inv.vendor ? populateVendor(inv.vendor._id || inv.vendor) : null,
    purchaseOrder: inv.purchaseOrder ? populatePO(inv.purchaseOrder) : null
  };
  res.json({ success: true, data: populated });
});

app.post('/api/invoices/:id/reprocess', auth, async (req, res) => {
  const inv = db.invoices.find(i => i._id === req.params.id);
  if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found' });
  inv.status = 'uploaded';
  inv.processingLog.push({ timestamp: new Date(), action: 'Reprocess Requested', details: 'Manual reprocessing triggered', status: 'info' });
  processInvoice(inv).catch(console.error);
  res.json({ success: true, message: 'Reprocessing started', data: inv });
});

app.delete('/api/invoices/:id', auth, (req, res) => {
  const idx = db.invoices.findIndex(i => i._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Invoice not found' });
  db.invoices.splice(idx, 1);
  res.json({ success: true, message: 'Invoice deleted' });
});

// ===================== DASHBOARD =====================
app.get('/api/dashboard/stats', auth, (req, res) => {
  const invoices = db.invoices;
  const byStatus = (s) => invoices.filter(i => i.status === s).length;
  const recentInvoices = [...invoices].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5).map(inv => ({
    _id: inv._id, invoiceNumber: inv.invoiceNumber, status: inv.status,
    validationResult: { matchScore: inv.validationResult?.matchScore },
    createdAt: inv.createdAt,
    uploadedFile: { originalName: inv.uploadedFile?.originalName },
    vendor: inv.vendor ? populateVendor(inv.vendor._id || inv.vendor) : null,
    purchaseOrder: inv.purchaseOrder ? db.purchaseOrders.find(p => p._id === inv.purchaseOrder) : null
  }));
  res.json({ success: true, data: {
    invoices: { total: invoices.length, validated: byStatus('validated'), rejected: byStatus('rejected'), processing: byStatus('processing'), uploaded: byStatus('uploaded') },
    vendors: db.vendors.filter(v => v.status === 'active').length,
    purchaseOrders: db.purchaseOrders.length,
    recentInvoices,
    statusBreakdown: ['validated','rejected','processing','uploaded'].map(s => ({ _id: s, count: byStatus(s) })).filter(x => x.count > 0)
  }});
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: 'demo-in-memory', timestamp: new Date().toISOString() }));

// Error handler
app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false, message: err.message }));

const PORT = process.env.PORT || 5000;
seed().then(() => {
  app.listen(PORT, () => console.log(`Demo server running on port ${PORT} (in-memory mode)`));
});
