const crypto = require('crypto');
const fs = require('fs');
const Invoice = require('../models/Invoice');
const PurchaseOrder = require('../models/PurchaseOrder');

function computeFileHash(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function checkDuplicate(fileHash, invoiceNumber, excludeId = null) {
  const query = { $or: [{ 'uploadedFile.hash': fileHash }] };
  if (invoiceNumber) query.$or.push({ invoiceNumber });
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await Invoice.findOne(query);
  return existing
    ? { isDuplicate: true, similarInvoiceId: existing._id }
    : { isDuplicate: false, similarInvoiceId: null };
}

function normalizeStr(str) {
  return str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

/**
 * Look up a Purchase Order by its number, the way a real ERP would for a
 * bulk-uploaded invoice — no human picks the PO, the document's own
 * "PO Number" field (already pulled out by extractionService) is the key.
 *
 * Deliberately searches across *every* PO status, not just "approved" —
 * see the poStatus check in validateAgainstPO() for why: if this only
 * matched approved POs, an invoice referencing an already-closed PO would
 * find nothing here and silently fall back to the much more lenient
 * fuzzy-vendor-only path, which is exactly the "a second invoice slips
 * through against a PO that's already done" scenario this feature exists
 * to prevent. Returning the closed PO (so validateAgainstPO can flag it)
 * is the safer behavior.
 *
 * @param {string} poNumberRaw - the PO number as OCR/extraction read it
 * @returns {Promise<import('mongoose').Document|null>} populated PurchaseOrder, or null
 */
async function findPurchaseOrderByNumber(poNumberRaw) {
  if (!poNumberRaw) return null;
  const trimmed = String(poNumberRaw).trim();
  if (!trimmed) return null;

  // Fast path: case-insensitive exact match (handles the common case where
  // OCR gets the characters right but not necessarily the casing).
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exact = await PurchaseOrder.findOne({ poNumber: { $regex: new RegExp(`^${escaped}$`, 'i') } }).populate('vendor');
  if (exact) return exact;

  // Fallback: normalized comparison (strips dashes/slashes/spaces) to absorb
  // minor OCR punctuation noise, e.g. "PO 2026 00001" vs "PO-2026-00001".
  // A full scan is fine at this project's scale; would need an indexed
  // normalized field if the PO table grew into the tens of thousands.
  const target = normalizeStr(trimmed);
  const candidates = await PurchaseOrder.find({}).populate('vendor');
  return candidates.find((p) => normalizeStr(p.poNumber) === target) || null;
}

function vendorNamesMatch(name1, name2) {
  if (!name1 || !name2) return false;
  const n1 = normalizeStr(name1);
  const n2 = normalizeStr(name2);
  return n1.includes(n2) || n2.includes(n1) || n1 === n2;
}

function amountsMatch(val1, val2, tolerancePct = 5) {
  if (val1 == null || val2 == null) return false;
  if (val1 === 0 && val2 === 0) return true;
  const diff = Math.abs(val1 - val2);
  const base = Math.max(Math.abs(val1), Math.abs(val2));
  return (diff / base) * 100 <= tolerancePct;
}

/**
 * Validate verified invoice data against a Purchase Order.
 * @param {object} verifiedData - userVerifiedData (flat key→value) merged over extractedData
 * @param {object} purchaseOrder - Populated PurchaseOrder document
 * @param {object} vendor - Populated Vendor document
 */
function validateAgainstPO(verifiedData, purchaseOrder, vendor) {
  const discrepancies = [];
  let scorePoints = 0;

  // A PO that isn't "approved" should never produce a fresh "passed" result.
  // "closed"/"cancelled" means a previous invoice already used this PO up
  // (closing it is exactly what invoiceController.submitMatching does the
  // moment an invoice passes against it — see that file), so a second
  // invoice landing on the same PO almost certainly means a duplicate or
  // erroneous re-submission, not a real new charge. "draft" means it was
  // never approved for spending in the first place. Either way, force a
  // human to look rather than silently letting it through.
  if (purchaseOrder?.status && purchaseOrder.status !== 'approved') {
    discrepancies.push({
      field: 'poStatus',
      expected: 'approved',
      actual: purchaseOrder.status,
      severity: 'high'
    });
  }

  // Helper: get numeric value from verifiedData (supports both flat and nested)
  const getNum = (key) => {
    const v = verifiedData[key];
    return v != null ? parseFloat(v) : null;
  };
  const getStr = (key) => {
    const v = verifiedData[key];
    return v != null ? String(v).trim() : null;
  };

  // Vendor Name (20 pts)
  const extractedVendorName = getStr('vendorName');
  const expectedVendorName = vendor?.name;
  if (extractedVendorName && expectedVendorName) {
    if (vendorNamesMatch(extractedVendorName, expectedVendorName)) {
      scorePoints += 20;
    } else {
      discrepancies.push({ field: 'vendorName', expected: expectedVendorName, actual: extractedVendorName, severity: 'high' });
    }
  } else {
    scorePoints += 10;
  }

  // PO Number (25 pts)
  const extractedPONumber = getStr('poNumber');
  const expectedPONumber = purchaseOrder?.poNumber;
  if (extractedPONumber && expectedPONumber) {
    if (normalizeStr(extractedPONumber) === normalizeStr(expectedPONumber)) {
      scorePoints += 25;
    } else {
      discrepancies.push({ field: 'poNumber', expected: expectedPONumber, actual: extractedPONumber, severity: 'high' });
    }
  } else {
    scorePoints += 12; // partial if not extracted
  }

  // Total Amount (30 pts)
  const extractedTotal = getNum('totalAmount');
  const expectedTotal = purchaseOrder?.totalAmount;
  if (extractedTotal != null && expectedTotal != null) {
    if (amountsMatch(extractedTotal, expectedTotal, 5)) {
      scorePoints += 30;
    } else {
      const diff = ((Math.abs(extractedTotal - expectedTotal) / expectedTotal) * 100).toFixed(1);
      discrepancies.push({
        field: 'totalAmount',
        expected: expectedTotal,
        actual: extractedTotal,
        severity: parseFloat(diff) > 10 ? 'high' : 'medium'
      });
    }
  } else if (extractedTotal == null) {
    discrepancies.push({ field: 'totalAmount', expected: expectedTotal, actual: null, severity: 'high' });
  }

  // Currency (10 pts)
  const extractedCurrency = getStr('currency');
  const expectedCurrency = purchaseOrder?.currency || 'USD';
  if (!extractedCurrency || extractedCurrency === expectedCurrency) {
    scorePoints += 10;
  } else {
    discrepancies.push({ field: 'currency', expected: expectedCurrency, actual: extractedCurrency, severity: 'medium' });
  }

  // SubTotal (10 pts)
  const extractedSubTotal = getNum('subTotal');
  const expectedSubTotal = purchaseOrder?.subTotal;
  if (extractedSubTotal != null && expectedSubTotal != null) {
    if (amountsMatch(extractedSubTotal, expectedSubTotal, 5)) {
      scorePoints += 10;
    } else {
      discrepancies.push({ field: 'subTotal', expected: expectedSubTotal, actual: extractedSubTotal, severity: 'low' });
    }
  } else {
    scorePoints += 5;
  }

  // Line Items Count (5 pts)
  const extractedLineItems = verifiedData.lineItems || [];
  const expectedLineItems = purchaseOrder?.lineItems || [];
  if (extractedLineItems.length > 0 && expectedLineItems.length > 0) {
    if (extractedLineItems.length === expectedLineItems.length) {
      scorePoints += 5;
    } else {
      discrepancies.push({ field: 'lineItemCount', expected: expectedLineItems.length, actual: extractedLineItems.length, severity: 'low' });
    }
  } else {
    scorePoints += 3;
  }

  const matchScore = Math.min(100, Math.round(scorePoints));
  const hasHighSeverity = discrepancies.some((d) => d.severity === 'high');
  const status = hasHighSeverity || matchScore < 60 ? 'review_required' : 'passed';

  return { status, matchScore, discrepancies };
}

module.exports = { computeFileHash, checkDuplicate, validateAgainstPO, findPurchaseOrderByNumber };
