const path = require('path');
const Invoice = require('../models/Invoice');
const PurchaseOrder = require('../models/PurchaseOrder');
const Vendor = require('../models/Vendor');
const { extractText } = require('../services/ocrService');
const { extractInvoiceData } = require('../services/extractionService');
const { computeFileHash, checkDuplicate, validateAgainstPO, findPurchaseOrderByNumber } = require('../services/validationService');
const { toCSV } = require('../utils/csv');
const mlClient = require('../services/mlClient');

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

      const extractedData = await extractInvoiceData(text);
      invoice.extractedData = extractedData;
      if (extractedData.invoiceNumber?.value) invoice.invoiceNumber = extractedData.invoiceNumber.value;

      // Auto-detect & link the Purchase Order this invoice should be matched
      // against, based on the PO number OCR just found in the document —
      // this is what lets bulk-uploaded invoices get matched without anyone
      // manually picking a PO. A PO chosen manually at upload time always
      // wins and is never overwritten here.
      if (!invoice.purchaseOrder && extractedData.poNumber?.value) {
        const matchedPO = await findPurchaseOrderByNumber(extractedData.poNumber.value);
        if (matchedPO) {
          invoice.purchaseOrder = matchedPO._id;
          if (!invoice.vendor) invoice.vendor = matchedPO.vendor?._id || matchedPO.vendor;
          invoice.processingLog.push({
            action: 'PO Auto-Matched',
            details: `Linked to ${matchedPO.poNumber} (auto-detected from extracted PO number "${extractedData.poNumber.value}")`,
            status: 'success'
          });
        } else {
          invoice.processingLog.push({
            action: 'PO Auto-Match Failed',
            details: `Extracted PO number "${extractedData.poNumber.value}" did not match any purchase order in the system — link one manually if needed`,
            status: 'warning'
          });
        }
      }

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

    // Second chance at auto-linking a PO: triggerOCR already tries this right
    // after extraction, but if that lookup failed (garbled OCR) and the user
    // then corrected the "PO Number" field during review, this is where that
    // correction actually gets a PO attached before scoring runs.
    if (!invoice.purchaseOrder && verifiedData.poNumber) {
      const matchedPO = await findPurchaseOrderByNumber(verifiedData.poNumber);
      if (matchedPO) {
        invoice.purchaseOrder = matchedPO; // populated doc — used directly below, cast to its _id on save
        if (!invoice.vendor) invoice.vendor = matchedPO.vendor;
        invoice.processingLog.push({
          action: 'PO Auto-Matched',
          details: `Linked to ${matchedPO.poNumber} at match time (based on the verified PO number)`,
          status: 'success'
        });
      }
    }

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

      // Ask the ML service for a semantic vendor-name match, which can rescue a
      // genuine match that validateAgainstPO's substring comparison misses
      // (e.g. "TechCorp" vs "Technology Corporation"). Best-effort: if the ML
      // service is down we just don't pass the hint and substring matching
      // stands on its own.
      let mlVendorMatch;
      const poVendorName = vendor?.name;
      if (verifiedData.vendorName && poVendorName) {
        try {
          const m = await mlClient.match(verifiedData.vendorName, poVendorName);
          mlVendorMatch = m.is_match;
          invoice.processingLog.push({
            action: 'ML Vendor Match',
            details: `"${verifiedData.vendorName}" vs "${poVendorName}" → ${(m.similarity * 100).toFixed(1)}% similar (${m.is_match ? 'match' : 'no match'})`,
            status: 'info'
          });
        } catch (mlError) {
          console.error('ML match unavailable, falling back to substring match:', mlError.message);
        }
      }

      validationResult = validateAgainstPO(verifiedData, po, vendor, { mlVendorMatch });
      validationResult.duplicateCheck = duplicateCheck;
    } else {
      // No Purchase Order could be linked — by upload time, OCR auto-detection,
      // AND the second-chance lookup above. There is nothing to verify this
      // invoice's vendor, amounts, or line items against, so it can NEVER
      // reach "passed" here — fail closed, not open. (The previous version of
      // this fallback defaulted `vendorMatchStatus` to "passed" and only
      // demoted it if a vendor name was extracted AND failed to match — a
      // completely blank/garbage extraction, e.g. a random PDF with no
      // recognizable vendor name at all, skipped that check entirely and
      // silently passed with an 80% score. That's exactly backwards: missing
      // evidence is not the same as a clean match, and a control that can't
      // tell the difference can be walked straight through by a fabricated
      // document. This path now always returns review_required, with
      // discrepancies that say plainly what's missing so a human has the
      // context to decide — never an automatic pass.)
      const discrepancies = [
        { field: 'purchaseOrder', expected: 'A matching purchase order', actual: 'None found or linked', severity: 'high' }
      ];

      let knownVendor = false;
      if (verifiedData.vendorName) {
        const allVendors = await Vendor.find({ status: 'active' }).select('name');
        const match = allVendors.find((v) =>
          v.name.toLowerCase().includes(verifiedData.vendorName.toLowerCase()) ||
          verifiedData.vendorName.toLowerCase().includes(v.name.toLowerCase())
        );
        knownVendor = !!match;
        if (!match) {
          discrepancies.push({ field: 'vendorName', expected: 'Known vendor', actual: verifiedData.vendorName, severity: 'medium' });
        }
      } else {
        discrepancies.push({ field: 'vendorName', expected: 'A vendor name', actual: null, severity: 'high' });
      }

      if (verifiedData.totalAmount == null) {
        discrepancies.push({ field: 'totalAmount', expected: 'An extracted amount', actual: null, severity: 'high' });
      }

      validationResult = {
        status: 'review_required',
        // Still meaningful as a confidence signal even though it can never
        // produce "passed" here — higher when there's at least a recognized
        // vendor and an amount to show a reviewer, lower when there's
        // essentially nothing usable in the document at all.
        matchScore: knownVendor && verifiedData.totalAmount != null ? 35 : 10,
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

    // Close the PO out the moment this invoice is confirmed as a correct
    // match against it — so a second invoice can never land on the same PO
    // and silently pass too (validateAgainstPO's poStatus check is what
    // catches that second invoice and forces it to review_required once
    // the PO here is no longer "approved"). Only reached when status is
    // "passed", which validateAgainstPO only returns for a PO that was
    // still "approved" at scoring time — so this is never closing a PO
    // that was draft/already-closed/cancelled.
    const poToClose = invoice.purchaseOrder?._id || invoice.purchaseOrder;
    if (validationResult.status === 'passed' && poToClose) {
      await PurchaseOrder.findByIdAndUpdate(poToClose, { status: 'closed' });
      invoice.processingLog.push({
        action: 'Purchase Order Closed',
        details: `PO automatically closed after this invoice passed verification — it can no longer be matched against another invoice`,
        status: 'info'
      });
    }

    // ── ML anomaly scoring ────────────────────────────────────────────────
    // Score this invoice for anomalous spend against the vendor's own history
    // (Isolation Forest in the Python ML service). Purely informational — it
    // annotates the invoice with a risk level but does not change the
    // pass/review decision. Best-effort: if the ML service is down the invoice
    // still saves, just with riskLevel "unknown".
    try {
      const amount = parseFloat(verifiedData.totalAmount) || 0;
      const poTotal = invoice.purchaseOrder?.totalAmount || null;
      const lineItemCount = verifiedData.lineItems?.length || 1;
      const vendorId = invoice.vendor?._id || invoice.vendor;

      // Derive history-based features from this vendor's prior invoices.
      let amountZscore = 0, frequency = 0, daysSinceLast = 0;
      if (vendorId) {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const priorInvoices = await Invoice.find({ vendor: vendorId, _id: { $ne: invoice._id } })
          .select('userVerifiedData extractedData createdAt')
          .sort({ createdAt: -1 });

        frequency = priorInvoices.filter((p) => p.createdAt >= since).length;
        if (priorInvoices.length) {
          daysSinceLast = Math.round((Date.now() - new Date(priorInvoices[0].createdAt).getTime()) / (24 * 60 * 60 * 1000));
          const amounts = priorInvoices
            .map((p) => parseFloat(p.userVerifiedData?.totalAmount ?? p.extractedData?.totalAmount?.value))
            .filter((n) => !Number.isNaN(n));
          if (amounts.length) {
            const mean = amounts.reduce((s, n) => s + n, 0) / amounts.length;
            const std = Math.sqrt(amounts.reduce((s, n) => s + (n - mean) ** 2, 0) / amounts.length);
            amountZscore = std > 0 ? (amount - mean) / std : 0;
          }
        }
      }

      const anomalyResult = await mlClient.anomaly({
        amount_zscore:            Number(amountZscore.toFixed(4)),
        amount_to_po_ratio:       poTotal ? Number((amount / poTotal).toFixed(4)) : 1,
        vendor_invoice_frequency: frequency,
        days_since_last_invoice:  daysSinceLast,
        line_item_count:          lineItemCount,
        amount_per_line_item:     Number((amount / lineItemCount).toFixed(2)),
        is_round_number:          amount % 1000 === 0 ? 1 : 0,
      });
      invoice.anomalyScore = anomalyResult.anomaly_score;
      invoice.riskLevel = anomalyResult.risk_level;
      invoice.processingLog.push({
        action: 'Anomaly Scored',
        details: `Risk level: ${anomalyResult.risk_level} (anomaly score ${anomalyResult.anomaly_score})`,
        status: anomalyResult.risk_level === 'high' ? 'warning' : 'info'
      });
    } catch (mlError) {
      console.error('ML anomaly unavailable:', mlError.message);
      invoice.anomalyScore = null;
      invoice.riskLevel = 'unknown';
    }

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
