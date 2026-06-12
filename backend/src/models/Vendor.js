const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Vendor name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Vendor email is required'],
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String
    },
    taxId: {
      type: String,
      trim: true
    },
    registrationNumber: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    },
    bankDetails: {
      accountName: String,
      accountNumber: String,
      bankName: String,
      routingNumber: String
    },
    paymentTerms: {
      type: String,
      default: 'Net 30'
    },
    notes: String
  },
  { timestamps: true }
);

// Text search index
vendorSchema.index({ name: 'text', email: 'text' });

module.exports = mongoose.model('Vendor', vendorSchema);
