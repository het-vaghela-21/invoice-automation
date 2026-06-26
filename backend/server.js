const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./src/routes/authRoutes');
const vendorRoutes = require('./src/routes/vendorRoutes');
const purchaseOrderRoutes = require('./src/routes/purchaseOrderRoutes');
const invoiceRoutes = require('./src/routes/invoiceRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const userRoutes = require('./src/routes/userRoutes');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();

// Rate limiters — applied per IP before any route logic.
// Upload endpoint is expensive (OCR/ML), so it gets a tight limit; general
// reads get a looser one to support dashboard polling without false positives.
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_UPLOAD) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many uploads — please wait a minute before trying again.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_API) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests — please slow down.' },
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded invoice files. Routed through the storage layer so it works
// whether the file is on local disk or in MinIO. Looking the file up by its
// (unique, unguessable) filename also means only files that belong to a real
// invoice are served — stray paths 404.
const storage = require('./src/services/storageService');
const Invoice = require('./src/models/Invoice');
const { protect } = require('./src/middleware/auth');
app.get('/uploads/:filename', protect, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ 'uploadedFile.filename': req.params.filename })
      .select('uploadedFile').lean();
    if (!invoice) return res.status(404).send('Not found');
    const { mimetype } = invoice.uploadedFile;
    if (mimetype) res.type(mimetype);
    const stream = await storage.createReadStream(invoice.uploadedFile);
    stream.on('error', () => { if (!res.headersSent) res.status(404).end(); });
    stream.pipe(res);
  } catch (err) {
    res.status(404).send('Not found');
  }
});

// Broad rate limiter covers all API routes
app.use('/api', apiLimiter);

// Routes — uploadLimiter is applied inside invoiceRoutes on the POST / handler
app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/invoices', (req, res, next) => {
  // Tight limit only on the upload endpoint (POST /)
  if (req.method === 'POST' && req.path === '/') return uploadLimiter(req, res, next);
  next();
}, invoiceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Connect to MongoDB
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/invoice-automation';

// maxPoolSize controls how many concurrent MongoDB operations the server can
// have in flight. The driver default (100) is fine for most loads; expose it so
// it can be tuned per deployment. Bump it if you run many API/worker processes.
mongoose
  .connect(MONGODB_URI, { maxPoolSize: Number(process.env.MONGO_POOL_SIZE) || 100 })
  .then(async () => {
    console.log('Connected to MongoDB');

    // Initialise file storage (local disk or MinIO). Falls back to local if a
    // MinIO backend is configured but unreachable, so the API still boots.
    await storage.init();

    // For single-machine dev/small deployments you can run the BullMQ worker in
    // the same process as the API (RUN_WORKER_INLINE=true) instead of a separate
    // `npm run worker`. For real scale, run dedicated worker processes instead.
    if (process.env.RUN_WORKER_INLINE === 'true') {
      const { startInvoiceWorker } = require('./src/workers/invoiceWorker');
      startInvoiceWorker();
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = app;
