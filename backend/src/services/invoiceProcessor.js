// Core invoice-processing logic, decoupled from Express (no req/res here).
//
// These two functions hold everything that is slow and CPU/IO-heavy about an
// invoice — OCR text extraction, ML field extraction, PO auto-linking, vendor
// matching and anomaly scoring. They operate purely on an invoice _id, load the
// document themselves, mutate it, save it, and return the populated result.
//
// Pulling this out of the controller is what makes the work runnable from two
// places with identical behaviour:
//   1. A BullMQ worker (the scalable path — see src/workers/invoiceWorker.js)
//   2. Inline in the request handler (the fallback when Redis/the queue is off)
//
// Keeping a single source of truth here means the queued and inline paths can
// never drift apart.

const path = require('path');
const Invoice = require('../models/Invoice');
const PurchaseOrder = require('../models/PurchaseOrder');
const Vendor = require('../models/Vendor');
const { extractText } = require('./ocrService');
const { extractInvoiceData } = require('./extractionService');
const { checkDuplicate, validateAgainstPO, findPurchaseOrderByNumber } = require('./validationService');
const mlClient = require('./mlClient');

// Flatten extractedData into a key→value map for matching. Mirrors the helper
// the controller used to own; kept here so both processing steps can share it.
function flattenExtracted(extractedData) {
  if (!extractedData) return {};
  return {
    vendorName:    extractedData.vendorName?.value   ?? null,
    gstNumber:     extractedData.gstNumber?.value     ?? null,
    poNumber:      extractedData.poNumber?.value       ?? null,
    invoiceNumber: extractedData.invoiceNumber?.value   ?? null,
    invoiceDate:   extractedData.invoiceDate?.value    ?? null,
    dueDate:       extractedData.dueDate?.value        ?? null,
    totalAmount:   extractedData.totalAmount?.value    ?? null,
    subTotal:      extractedData.subTotal?.value       ?? null,
    taxAmount:     extractedData.tax?.value            ?? null,
    currency:      extractedData.currency?.value       ?? null,
    bankAccount:   extractedData.bankAccount?.value    ?? null,
    lineItems:     extractedData.lineItems             ?? []
  };
}

const populateInvoice = (id) =>
  Invoice.findById(id)
    .populate('vendor', 'name email phone address taxId requiredFields')
    .populate({ path: 'purchaseOrder', populate: { path: 'vendor', select: 'name email' } });

// ── Step 1: OCR + extraction ────────────────────────────────────────────────
// Reads the stored PDF, extracts text, runs field extraction (regex + ML),
// auto-links a PO if one can be detected, and runs the duplicate check.
// Throws on hard OCR failure so the caller (worker or controller) can record it.
async function runOCR(invoiceId) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  const filePath = path.join(__dirname, '../../', invoice.uploadedFile.path);
  const { text, confidence, method } = await extractText(filePath, invoice.uploadedFile.mimetype);
  invoice.ocrText = text;

  const extractedData = await extractInvoiceData(text);
  invoice.extractedData = extractedData;
  if (extractedData.invoiceNumber?.value) invoice.invoiceNumber = extractedData.invoiceNumber.value;

  // Auto-detect & link the Purchase Order based on the PO number OCR found.
  // A PO chosen manually at upload time always wins and is never overwritten.
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
  return populateInvoice(invoice._id);
}

// ── Step 2: vendor + PO matching + anomaly scoring ──────────────────────────
// The full verification pass: builds the data to match (user-verified values
// override extracted ones), links a PO on the strength of a corrected PO number
// if needed, scores against the PO (with an optional ML semantic-match rescue),
// closes a passed PO, and finally annotates the invoice with an ML anomaly
// score. Best-effort on every ML call — the Python service being down never
// blocks the verdict.
async function runMatching(invoiceId) {
  const invoice = await Invoice.findById(invoiceId)
    .populate('vendor')
    .populate({ path: 'purchaseOrder', populate: { path: 'vendor' } });
  if (!invoice) throw new Error('Invoice not found');

  const baseline = flattenExtracted(invoice.extractedData);
  const verifiedData = { ...baseline, ...(invoice.userVerifiedData || {}) };

  // Second chance at auto-linking a PO from a user-corrected PO number.
  if (!invoice.purchaseOrder && verifiedData.poNumber) {
    const matchedPO = await findPurchaseOrderByNumber(verifiedData.poNumber);
    if (matchedPO) {
      invoice.purchaseOrder = matchedPO; // populated doc — cast to its _id on save
      if (!invoice.vendor) invoice.vendor = matchedPO.vendor;
      invoice.processingLog.push({
        action: 'PO Auto-Matched',
        details: `Linked to ${matchedPO.poNumber} at match time (based on the verified PO number)`,
        status: 'success'
      });
    }
  }

  // Always re-run duplicate check so a deleted duplicate doesn't block matching.
  const freshDuplicateCheck = await checkDuplicate(
    invoice.uploadedFile?.hash,
    invoice.invoiceNumber || verifiedData.invoiceNumber,
    invoice._id
  );
  const duplicateCheck = {
    isDuplicate: freshDuplicateCheck.isDuplicate,
    similarInvoiceId: freshDuplicateCheck.similarInvoiceId || null
  };

  let validationResult;

  if (invoice.purchaseOrder) {
    const po = invoice.purchaseOrder;
    const vendor = po.vendor || invoice.vendor;

    // ML semantic vendor-name match — can rescue a genuine match that
    // substring comparison misses. Best-effort: if ML is down, skip the hint.
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
    // No PO could be linked — fail closed: this invoice can never auto-pass.
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
      matchScore: knownVendor && verifiedData.totalAmount != null ? 35 : 10,
      discrepancies,
      duplicateCheck
    };
  }

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

  // Close a passed PO so a second invoice can't silently match it too.
  const poToClose = invoice.purchaseOrder?._id || invoice.purchaseOrder;
  if (validationResult.status === 'passed' && poToClose) {
    await PurchaseOrder.findByIdAndUpdate(poToClose, { status: 'closed' });
    invoice.processingLog.push({
      action: 'Purchase Order Closed',
      details: `PO automatically closed after this invoice passed verification — it can no longer be matched against another invoice`,
      status: 'info'
    });
  }

  // ── ML anomaly scoring (informational only) ──────────────────────────────
  try {
    const amount = parseFloat(verifiedData.totalAmount) || 0;
    const poTotal = invoice.purchaseOrder?.totalAmount || null;
    const lineItemCount = verifiedData.lineItems?.length || 1;
    const vendorId = invoice.vendor?._id || invoice.vendor;

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
  return populateInvoice(invoice._id);
}

module.exports = { runOCR, runMatching, flattenExtracted };
