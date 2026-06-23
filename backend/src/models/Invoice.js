const mongoose = require('mongoose');

const extractedLineItemSchema = new mongoose.Schema({
  description: String,
  quantity: Number,
  unitPrice: Number,
  totalPrice: Number,
  confidence: { type: Number, default: 0 }
});

const discrepancySchema = new mongoose.Schema({
  field: String,
  expected: mongoose.Schema.Types.Mixed,
  actual: mongoose.Schema.Types.Mixed,
  severity: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  }
});

const processingLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  action: String,
  details: String,
  status: {
    type: String,
    enum: ['info', 'success', 'error', 'warning'],
    default: 'info'
  }
});

const fieldChangeSchema = new mongoose.Schema({
  field: String,
  oldValue: String,
  newValue: String,
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  changedAt: { type: Date, default: Date.now }
});

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, trim: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    uploadedFile: {
      filename: String,
      originalName: String,
      mimetype: String,
      path: String,
      size: Number,
      hash: String
    },
    ocrText: { type: String, default: '' },
    extractedData: {
      invoiceNumber: { value: String, confidence: Number },
      vendorName:    { value: String, confidence: Number },
      gstNumber:     { value: String, confidence: Number },
      poNumber:      { value: String, confidence: Number },
      invoiceDate:   { value: String, confidence: Number },
      dueDate:       { value: String, confidence: Number },
      lineItems:     [extractedLineItemSchema],
      subTotal:      { value: Number, confidence: Number },
      tax:           { value: Number, confidence: Number },
      totalAmount:   { value: Number, confidence: Number },
      currency:      { value: String, confidence: Number },
      bankAccount:   { value: String, confidence: Number }
    },
    // User-edited version of extracted fields (flat key→value)
    userVerifiedData: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Log of every field change made by users
    fieldChanges: [fieldChangeSchema],
    validationResult: {
      status: {
        type: String,
        enum: ['passed', 'review_required', 'rejected', 'pending'],
        default: 'pending'
      },
      matchScore: { type: Number, default: 0 },
      discrepancies: [discrepancySchema],
      duplicateCheck: {
        isDuplicate: { type: Boolean, default: false },
        similarInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }
      }
    },
    status: {
      type: String,
      enum: ['uploaded', 'ocr_extracted', 'pending_review', 'review_required', 'passed', 'rejected'],
      default: 'uploaded'
    },
    // ML anomaly detection results (Isolation Forest in the Python ML service).
    // null/unknown until matching runs, or whenever the ML service is unavailable.
    anomalyScore: { type: Number, default: null },
    riskLevel:    { type: String, enum: ['low', 'medium', 'high', 'unknown'], default: 'unknown' },
    processingLog: [processingLogSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

invoiceSchema.index({ 'uploadedFile.hash': 1 });
invoiceSchema.index({ status: 1, createdAt: -1 });
invoiceSchema.index({ vendor: 1 });
// Compound index for the per-vendor summary endpoint, which filters invoices by
// vendor AND groups/counts them by status. Without this, that query falls back
// to the { vendor: 1 } index and then scans matching docs to bucket by status;
// the compound index lets MongoDB satisfy the (vendor, status) access pattern
// directly. (Benchmark flagged GET /vendors/:id/summary at ~268 ms.)
invoiceSchema.index({ vendor: 1, status: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
