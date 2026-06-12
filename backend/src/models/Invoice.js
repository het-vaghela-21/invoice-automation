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

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      trim: true
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor'
    },
    purchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder'
    },
    uploadedFile: {
      filename: String,
      originalName: String,
      mimetype: String,
      path: String,
      size: Number,
      hash: String
    },
    ocrText: {
      type: String,
      default: ''
    },
    extractedData: {
      invoiceNumber: { value: String, confidence: Number },
      vendorName: { value: String, confidence: Number },
      invoiceDate: { value: String, confidence: Number },
      dueDate: { value: String, confidence: Number },
      lineItems: [extractedLineItemSchema],
      subTotal: { value: Number, confidence: Number },
      tax: { value: Number, confidence: Number },
      totalAmount: { value: Number, confidence: Number },
      currency: { value: String, confidence: Number }
    },
    validationResult: {
      status: {
        type: String,
        enum: ['validated', 'rejected', 'pending'],
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
      enum: ['uploaded', 'processing', 'validated', 'rejected'],
      default: 'uploaded'
    },
    processingLog: [processingLogSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

// Index for duplicate detection and filtering
invoiceSchema.index({ 'uploadedFile.hash': 1 });
invoiceSchema.index({ status: 1, createdAt: -1 });
invoiceSchema.index({ vendor: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
