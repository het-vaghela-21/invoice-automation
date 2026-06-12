const path = require('path');
const Invoice = require('../models/Invoice');
const PurchaseOrder = require('../models/PurchaseOrder');
const Vendor = require('../models/Vendor');
const { extractText } = require('../services/ocrService');
const { extractInvoiceData } = require('../services/extractionService');
const { computeFileHash, checkDuplicate, validateAgainstPO } = require('../services/validationService');

// Helper: flatten extractedData into a key→value map for matching
function flattenExtracted(extractedData) {
  if (!extractedData) return {};
  return {
    vendorName:    extractedData.vendorName?.value  ?? null,
    gstNumber:     extractedData.gstNumber?.value   ?? null,
    poNumber:      extractedData.poNumber?.value     ?? null,
    invoiceNumber: extractedData.invoiceNumber?.value ?? null,
    invoiceDate:   extractedData.invoiceDate?.value  ?? null,
    dueDate:       extractedData.dueDate?.value      ?? null,
    totalAmount:   extractedData.totalAmount?.value  ?? null,
    subTotal:      extractedData.subTotal?.value     ?? null,
    taxAmount:     extractedData.tax?.value          ?? null,
    currency:      extractedData.currency?.value     ?? null,
    bankAccount:   extractedData.bankAccount?.value  ?? null,
    lineItems:     extractedData.lineItems           ?? []
  };
}

// Upload: store file only, no OCR
exports.uploadInvoice = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const { purchaseOrderId } = req.body;
    const filePath = path.join('uploads', req.file.filename);
    const absolutePath = path.join(__dirname, '../../', filePath);
    const fileHash = computeFileHash(absolutePath);

    let vendor;
    if (purchaseOrderId) {
      const po = await PurchaseOrder.findById(purchaseOrderId).populate('vendor');
      if (po) vendor = po.vendor._id;
    }

    const invoice = await Invoice.create({
      status: 'uploaded',
      vendor,
      purchaseOrder: purchaseOrderId || undefined,
      uploadedFile: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        path: filePath,
        size: req.file.size,
        hash: fileHash
      },
      processingLog: [{ action: 'Invoice Uploaded', details: `File: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`, status: 'info' }],
      createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

// User manually triggers OCR on a single invoice
exports.triggerOCR = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!['uploaded', 'ocr_extracted'].includes(invoice.status)) {
      return res.status(400).json({ success: false, message: 'OCR can only be triggered on uploaded invoices' });
    }

    invoice.processingLog.push({ action: 'OCR Started', details: `File type: ${invoice.uploadedFile.mimetype}`, status: 'info' });
    await invoice.save();

    // Run OCR async but wait for result (user is watching)
    try {
      const filePath = path.join(__dirname, '../../', invoice.uploadedFile.path);
      const { text, confidence, method } = await extractText(filePath, invoice.uploadedFile.mimetype);
      invoice.ocrText = text;

      const extractedData = extractInvoiceData(text);
      invoice.extractedData = extractedData;
      if (extractedData.invoiceNumber?.value) invoice.invoiceNumber = extractedData.invoiceNumber.value;

      // Duplicate check
      const dupCheck = await checkDuplicate(invoice.uploadedFile.hash, extractedData.invoiceNumber?.value, invoice._id);
      invoice.validationResult = { ...invoice.validationResult, duplicateCheck: dupCheck };

      invoice.status = 'ocr_extracted';
      invoice.processingLog.push({
        action: 'OCR Complete',
        details: `Extracted ${text.length} chars via ${method} (confidence: ${confidence}%). Fields found: ${extractedData.extractedFieldCount}/${extractedData.totalFields}`,
        status: 'success'
      });
      if (dupCheck.isDuplicate) {
        invoice.processingLog.push({ action: 'Duplicate Detected', details: 'A duplicate invoice was found in the system', status: 'warning' });
      }
      await invoice.save();
    } catch (ocrErr) {
      invoice.processingLog.push({ action: 'OCR Failed', details: ocrErr.message, status: 'error' });
      await invoice.save();
      return res.status(500).json({ success: false, message: 'OCR processing failed', error: ocrErr.message });
    }

    const populated = await Invoice.findById(invoice._id)
      .populate('vendor', 'name email phone address taxId requiredFields')
      .populate({ path: 'purchaseOrder', populate: { path: 'vendor', select: 'name email' } });

    res.json({ success: true, data: populated });
  } catch (err) { next(err); }
};

// User saves edited field values (with change logging)
exports.updateFields = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!['ocr_extracted', 'pending_review', 'review_required'].includes(invoice.status)) {
      return res.status(400).json({ success: false, message: 'Cannot edit fields in current status' });
    }

    const { fields } = req.body;
    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({ success: false, message: 'fields object required' });
    }

    const baseline = flattenExtracted(invoice.extractedData);
    const previous = invoice.userVerifiedData || {};

    for (const [key, newValue] of Object.entries(fields)) {
      const oldValue = previous[key] ?? baseline[key];
      const oldStr = oldValue != null ? String(oldValue) : '';
      const newStr = newValue != null ? String(newValue) : '';
      if (oldStr !== newStr) {
        invoice.fieldChanges.push({
          field: key,
          oldValue: oldStr,
          newValue: newStr,
          changedBy: req.user._id,
          changedAt: new Date()
        });
      }
    }

    invoice.userVerifiedData = { ...(invoice.userVerifiedData || {}), ...fields };
    invoice.status = 'pending_review';
    invoice.processingLog.push({
      action: 'Fields Saved',
      details: `User verified and saved ${Object.keys(fields).length} field(s)`,
      status: 'info'
    });
    await invoice.save();

    const populated = await Invoice.findById(invoice._id)
      .populate('vendor', 'name email phone address taxId requiredFields')
      .populate({ path: 'purchaseOrder', populate: { path: 'vendor', select: 'name email' } });

    res.json({ success: true, data: populated });
  } catch (err) { next(err); }
};

// User submits for vendor + PO matching
exports.submitMatching = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('vendor')
      .populate({ path: 'purchaseOrder', populate: { path: 'vendor' } });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!['ocr_extracted', 'pending_review', 'review_required'].includes(invoice.status)) {
      return res.status(400).json({ success: false, message: 'Cannot run matching in current status' });
    }

    // Build the data to match against: userVerifiedData takes priority over extractedData
    const baseline = flattenExtracted(invoice.extractedData);
    const verifiedData = { ...baseline, ...(invoice.userVerifiedData || {}) };

    // Always re-run duplicate check so a deleted duplicate doesn't block matching
    const freshDuplicateCheck = await checkDuplicate(
      invoice.uploadedFile?.hash,
      invoice.invoiceNumber || verifiedData.invoiceNumber,
      invoice._id
    );
    // Plain object — avoids Mongoose cast errors when re-assigning validationResult
    const duplicateCheck = {
      isDuplicate: freshDuplicateCheck.isDuplicate,
      similarInvoiceId: freshDuplicateCheck.similarInvoiceId || null
    };

    let validationResult;

    if (invoice.purchaseOrder) {
      const po = invoice.purchaseOrder;
      const vendor = po.vendor || invoice.vendor;
      validationResult = validateAgainstPO(verifiedData, po, vendor);
      validationResult.duplicateCheck = duplicateCheck;
    } else {
      // No PO linked — try fuzzy vendor match only
      let vendorMatchStatus = 'passed';
      const discrepancies = [];

      if (verifiedData.vendorName) {
        const allVendors = await Vendor.find({ status: 'active' }).select('name');
        const match = allVendors.find((v) =>
          v.name.toLowerCase().includes(verifiedData.vendorName.toLowerCase()) ||
          verifiedData.vendorName.toLowerCase().includes(v.name.toLowerCase())
        );
        if (!match) {
          vendorMatchStatus = 'review_required';
          discrepancies.push({ field: 'vendorName', expected: 'Known vendor', actual: verifiedData.vendorName, severity: 'medium' });
        }
      }

      validationResult = {
        status: vendorMatchStatus,
        matchScore: vendorMatchStatus === 'passed' ? 80 : 40,
        discrepancies,
        duplicateCheck
      };
    }

    // If a duplicate is still detected, force to review_required regardless of PO match
    if (duplicateCheck.isDuplicate) {
      validationResult.status = 'review_required';
      validationResult.discrepancies = [
        ...validationResult.discrepancies,
        { field: 'duplicateInvoice', expected: 'Unique invoice', actual: 'Duplicate detected', severity: 'high' }
      ];
    }

    invoice.validationResult = validationResult;
    invoice.status = validationResult.status;
    invoice.processingLog.push({
      action: 'Matching Complete',
      details: `Score: ${validationResult.matchScore}% | Status: ${validationResult.status} | Discrepancies: ${validationResult.discrepancies.length}`,
      status: validationResult.status === 'passed' ? 'success' : 'warning'
    });
    await invoice.save();

    const populated = await Invoice.findById(invoice._id)
      .populate('vendor', 'name email phone address taxId requiredFields')
      .populate({ path: 'purchaseOrder', populate: { path: 'vendor', select: 'name email' } });

    res.json({ success: true, data: populated });
  } catch (err) { next(err); }
};

// User explicitly rejects the invoice
exports.rejectInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const { reason } = req.body;
    invoice.status = 'rejected';
    invoice.processingLog.push({
      action: 'Invoice Rejected',
      details: reason || 'Manually rejected by user',
      status: 'error'
    });
    await invoice.save();

    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

exports.getInvoices = async (req, res, next) => {
  try {
    const { status, vendor, purchaseOrder, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (vendor) query.vendor = vendor;
    if (purchaseOrder) query.purchaseOrder = purchaseOrder;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate('vendor', 'name email')
        .populate('purchaseOrder', 'poNumber totalAmount')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-ocrText -processingLog'),
      Invoice.countDocuments(query)
    ]);
    res.json({ success: true, data: invoices, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

exports.getInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('vendor', 'name email phone address taxId requiredFields')
      .populate('fieldChanges.changedBy', 'name email')
      .populate({ path: 'purchaseOrder', populate: { path: 'vendor', select: 'name email' } });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

exports.deleteInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (err) { next(err); }
};
