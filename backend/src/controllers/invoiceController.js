const path = require('path');
const Invoice = require('../models/Invoice');
const PurchaseOrder = require('../models/PurchaseOrder');
const { computeFileHash } = require('../services/validationService');
const { runOCR, runMatching, flattenExtracted } = require('../services/invoiceProcessor');
const { isQueueReady, enqueueInvoiceJob, getJobStatus } = require('../config/queue');
const { toCSV } = require('../utils/csv');

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

// User manually triggers OCR on a single invoice.
//
// Two paths, same work (see services/invoiceProcessor.runOCR):
//   • Queue ready  → enqueue a job, return 202 + jobId immediately. The HTTP
//                     connection is freed in milliseconds; a worker does the OCR.
//                     This is what lets the system absorb thousands of uploads.
//   • Queue off    → run inline and return the finished invoice (original
//                     behaviour, kept so the app works with no Redis).
exports.triggerOCR = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!['uploaded', 'ocr_extracted'].includes(invoice.status)) {
      return res.status(400).json({ success: false, message: 'OCR can only be triggered on uploaded invoices' });
    }

    if (isQueueReady()) {
      invoice.processingLog.push({ action: 'OCR Queued', details: `File type: ${invoice.uploadedFile.mimetype} — queued for background processing`, status: 'info' });
      await invoice.save();
      const job = await enqueueInvoiceJob('ocr', { invoiceId: invoice._id.toString() });
      return res.status(202).json({
        success: true,
        queued: true,
        jobId: job.id,
        message: 'OCR queued for processing',
        data: invoice,
      });
    }

    // ── Inline fallback (no queue) ──
    invoice.processingLog.push({ action: 'OCR Started', details: `File type: ${invoice.uploadedFile.mimetype}`, status: 'info' });
    await invoice.save();
    try {
      const populated = await runOCR(invoice._id);
      return res.json({ success: true, queued: false, data: populated });
    } catch (ocrErr) {
      invoice.processingLog.push({ action: 'OCR Failed', details: ocrErr.message, status: 'error' });
      await invoice.save();
      return res.status(500).json({ success: false, message: 'OCR processing failed', error: ocrErr.message });
    }
  } catch (err) { next(err); }
};

// Poll a queued job's state. The frontend uses this after a 202 to know when
// background OCR/matching has finished, then re-fetches the invoice.
exports.getJobStatus = async (req, res, next) => {
  try {
    const status = await getJobStatus(req.params.jobId);
    if (!status) return res.status(404).json({ success: false, message: 'Job not found (it may have completed and been cleaned up)' });
    res.json({ success: true, data: status });
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

// User submits for vendor + PO matching.
//
// Same dual-path shape as triggerOCR: enqueue when the queue is ready (the
// matching pass also does ML calls + a history scan, so it's worth offloading),
// otherwise run inline. All the actual logic lives in invoiceProcessor.runMatching.
exports.submitMatching = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!['ocr_extracted', 'pending_review', 'review_required'].includes(invoice.status)) {
      return res.status(400).json({ success: false, message: 'Cannot run matching in current status' });
    }

    if (isQueueReady()) {
      invoice.processingLog.push({ action: 'Matching Queued', details: 'Queued for background verification', status: 'info' });
      await invoice.save();
      const job = await enqueueInvoiceJob('match', { invoiceId: invoice._id.toString() });
      return res.status(202).json({
        success: true,
        queued: true,
        jobId: job.id,
        message: 'Matching queued for processing',
        data: invoice,
      });
    }

    // ── Inline fallback (no queue) ──
    const populated = await runMatching(invoice._id);
    res.json({ success: true, queued: false, data: populated });
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
    // List views only render a handful of summary fields, so drop the heavy
    // sub-documents (raw OCR text, the full processing log, extracted/verified
    // field maps, field-change history) from the payload. The benchmark flagged
    // ?limit=100 at ~200 ms, dominated by serialising these. `.lean()` returns
    // plain objects so Mongoose doesn't hydrate full documents we never mutate.
    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate('vendor', 'name email')
        .populate('purchaseOrder', 'poNumber totalAmount')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-ocrText -processingLog -extractedData -userVerifiedData -fieldChanges')
        .lean(),
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

// Export the (optionally filtered) invoice list as CSV — same filters as getInvoices,
// but no pagination, since the point is to get everything into a spreadsheet at once.
exports.exportInvoicesCSV = async (req, res, next) => {
  try {
    const { status, vendor, purchaseOrder } = req.query;
    const query = {};
    if (status) query.status = status;
    if (vendor) query.vendor = vendor;
    if (purchaseOrder) query.purchaseOrder = purchaseOrder;

    const invoices = await Invoice.find(query)
      .populate('vendor', 'name')
      .populate('purchaseOrder', 'poNumber')
      .sort({ createdAt: -1 })
      .select('-ocrText -processingLog -fieldChanges');

    const verified = (inv, key) => inv.userVerifiedData?.[key];
    const columns = [
      { key: (i) => i.invoiceNumber || '', label: 'Invoice Number' },
      { key: (i) => i.vendor?.name || '', label: 'Vendor' },
      { key: (i) => i.purchaseOrder?.poNumber || '', label: 'PO Number' },
      { key: (i) => verified(i, 'totalAmount') ?? i.extractedData?.totalAmount?.value ?? '', label: 'Total Amount' },
      { key: (i) => verified(i, 'currency') ?? i.extractedData?.currency?.value ?? '', label: 'Currency' },
      { key: (i) => i.status, label: 'Status' },
      { key: (i) => i.validationResult?.matchScore ?? '', label: 'Match Score (%)' },
      { key: (i) => i.validationResult?.discrepancies?.length ?? 0, label: 'Discrepancies' },
      { key: (i) => i.uploadedFile?.originalName || '', label: 'File' },
      { key: (i) => i.createdAt?.toISOString() || '', label: 'Uploaded At' },
    ];

    const csv = toCSV(invoices, columns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="invoices-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
};
