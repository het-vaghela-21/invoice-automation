const path = require('path');
const Invoice = require('../models/Invoice');
const PurchaseOrder = require('../models/PurchaseOrder');
const { extractText } = require('../services/ocrService');
const { extractInvoiceData } = require('../services/extractionService');
const { computeFileHash, checkDuplicate, validateAgainstPO } = require('../services/validationService');

async function processInvoice(invoice) {
  try {
    // Mark as processing
    invoice.status = 'processing';
    invoice.processingLog.push({ action: 'OCR Started', details: `Method will be selected based on file type: ${invoice.uploadedFile.mimetype}`, status: 'info' });
    await invoice.save();

    // 1. OCR
    const filePath = path.join(__dirname, '../../', invoice.uploadedFile.path);
    const { text, confidence, method } = await extractText(filePath, invoice.uploadedFile.mimetype);
    invoice.ocrText = text;
    invoice.processingLog.push({ action: 'OCR Complete', details: `Extracted ${text.length} characters using ${method}, confidence: ${confidence}%`, status: 'success' });

    // 2. Field Extraction
    const extractedData = extractInvoiceData(text);
    invoice.extractedData = extractedData;
    if (extractedData.invoiceNumber?.value) {
      invoice.invoiceNumber = extractedData.invoiceNumber.value;
    }
    invoice.processingLog.push({ action: 'Extraction Complete', details: `Extracted ${extractedData.extractedFieldCount}/${extractedData.totalFields} key fields, overall confidence: ${extractedData.overallConfidence}%`, status: 'success' });

    // 3. Duplicate check
    const duplicateCheck = await checkDuplicate(
      invoice.uploadedFile.hash,
      extractedData.invoiceNumber?.value,
      invoice._id
    );

    // 4. Validation against PO
    let validationResult;
    if (invoice.purchaseOrder) {
      const po = await PurchaseOrder.findById(invoice.purchaseOrder).populate('vendor');
      if (po) {
        validationResult = validateAgainstPO(extractedData, po, po.vendor);
        validationResult.duplicateCheck = duplicateCheck;
        invoice.processingLog.push({ action: 'Validation Complete', details: `Match score: ${validationResult.matchScore}%, Status: ${validationResult.status}, Discrepancies: ${validationResult.discrepancies.length}`, status: validationResult.status === 'validated' ? 'success' : 'warning' });
      }
    } else {
      // No PO linked — just do duplicate check
      validationResult = {
        status: duplicateCheck.isDuplicate ? 'rejected' : 'pending',
        matchScore: 0,
        discrepancies: [],
        duplicateCheck
      };
      invoice.processingLog.push({ action: 'Validation Skipped', details: 'No Purchase Order linked to this invoice', status: 'warning' });
    }

    invoice.validationResult = validationResult;
    invoice.status = validationResult.status === 'validated' ? 'validated' : validationResult.status === 'rejected' ? 'rejected' : 'processing';
    await invoice.save();
  } catch (err) {
    invoice.status = 'uploaded'; // revert so user can retry
    invoice.processingLog.push({ action: 'Processing Error', details: err.message, status: 'error' });
    await invoice.save();
  }
}

exports.uploadInvoice = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

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

    // Process asynchronously — don't await, return immediately
    processInvoice(invoice).catch(console.error);

    res.status(201).json({
      success: true,
      message: 'Invoice uploaded and processing started',
      data: invoice
    });
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
      .populate('vendor', 'name email phone address taxId')
      .populate({ path: 'purchaseOrder', populate: { path: 'vendor', select: 'name email' } });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

exports.reprocessInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    invoice.status = 'uploaded';
    invoice.processingLog.push({ action: 'Reprocess Requested', details: 'Manual reprocessing triggered', status: 'info' });
    await invoice.save();

    processInvoice(invoice).catch(console.error);
    res.json({ success: true, message: 'Reprocessing started', data: invoice });
  } catch (err) { next(err); }
};

exports.deleteInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (err) { next(err); }
};
