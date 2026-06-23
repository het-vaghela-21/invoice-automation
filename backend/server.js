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

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
  .then(() => {
    console.log('Connected to MongoDB');

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
