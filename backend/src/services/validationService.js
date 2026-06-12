const crypto = require('crypto');
const fs = require('fs');
const Invoice = require('../models/Invoice');

/**
 * Compute SHA-256 hash of a file for duplicate detection
 * @param {string} filePath - Absolute path to file
 * @returns {string} hex hash
 */
function computeFileHash(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Check if a duplicate invoice already exists by:
 *  1. File hash match
 *  2. Invoice number match (if extracted)
 * @param {string} fileHash
 * @param {string|null} invoiceNumber
 * @param {string|null} excludeId - Invoice ID to exclude from search (for reprocessing)
 * @returns {Promise<{isDuplicate: boolean, similarInvoiceId: string|null}>}
 */
async function checkDuplicate(fileHash, invoiceNumber, excludeId = null) {
  const query = { $or: [{ 'uploadedFile.hash': fileHash }] };

  if (invoiceNumber) {
    query.$or.push({ invoiceNumber });
  }

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existing = await Invoice.findOne(query);

  if (existing) {
    return { isDuplicate: true, similarInvoiceId: existing._id };
  }

  return { isDuplicate: false, similarInvoiceId: null };
}

/**
 * Normalize a string for fuzzy comparison
 */
function normalizeStr(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Check if two vendor names are similar enough (loose match)
 */
function vendorNamesMatch(name1, name2) {
  if (!name1 || !name2) return false;
  const n1 = normalizeStr(name1);
  const n2 = normalizeStr(name2);
  return n1.includes(n2) || n2.includes(n1) || n1 === n2;
}

/**
 * Check if two monetary values match within a tolerance percentage
 */
function amountsMatch(val1, val2, tolerancePct = 5) {
  if (val1 == null || val2 == null) return false;
  if (val1 === 0 && val2 === 0) return true;
  const diff = Math.abs(val1 - val2);
  const base = Math.max(Math.abs(val1), Math.abs(val2));
  return (diff / base) * 100 <= tolerancePct;
}

/**
 * Validate extracted invoice data against a Purchase Order
 *
 * @param {object} extractedData - Output of extractionService.extractInvoiceData()
 * @param {object} purchaseOrder - Populated PurchaseOrder Mongoose document
 * @param {object} vendor - Populated Vendor Mongoose document
 * @returns {object} validationResult
 */
function validateAgainstPO(extractedData, purchaseOrder, vendor) {
  const discrepancies = [];
  let scorePoints = 0;
  const maxPoints = 100;

  // --- Vendor Name Check (20 points) ---
  const extractedVendorName = extractedData.vendorName?.value;
  const expectedVendorName = vendor?.name;
  if (extractedVendorName && expectedVendorName) {
    if (vendorNamesMatch(extractedVendorName, expectedVendorName)) {
      scorePoints += 20;
    } else {
      discrepancies.push({
        field: 'vendorName',
        expected: expectedVendorName,
        actual: extractedVendorName,
        severity: 'high'
      });
    }
  } else {
    // No extracted vendor — partial credit
    scorePoints += 10;
  }

  // --- Total Amount Check (40 points) ---
  const extractedTotal = extractedData.totalAmount?.value;
  const expectedTotal = purchaseOrder?.totalAmount;
  if (extractedTotal != null && expectedTotal != null) {
    if (amountsMatch(extractedTotal, expectedTotal, 5)) {
      scorePoints += 40;
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
    discrepancies.push({
      field: 'totalAmount',
      expected: expectedTotal,
      actual: null,
      severity: 'high'
    });
  }

  // --- Currency Check (10 points) ---
  const extractedCurrency = extractedData.currency?.value;
  const expectedCurrency = purchaseOrder?.currency || 'USD';
  if (!extractedCurrency || extractedCurrency === expectedCurrency) {
    scorePoints += 10;
  } else {
    discrepancies.push({
      field: 'currency',
      expected: expectedCurrency,
      actual: extractedCurrency,
      severity: 'medium'
    });
  }

  // --- SubTotal Check (15 points) ---
  const extractedSubTotal = extractedData.subTotal?.value;
  const expectedSubTotal = purchaseOrder?.subTotal;
  if (extractedSubTotal != null && expectedSubTotal != null) {
    if (amountsMatch(extractedSubTotal, expectedSubTotal, 5)) {
      scorePoints += 15;
    } else {
      discrepancies.push({
        field: 'subTotal',
        expected: expectedSubTotal,
        actual: extractedSubTotal,
        severity: 'low'
      });
    }
  } else {
    scorePoints += 7; // partial if not extracted
  }

  // --- Line Items Count Check (15 points) ---
  const extractedLineItems = extractedData.lineItems || [];
  const expectedLineItems = purchaseOrder?.lineItems || [];
  if (extractedLineItems.length > 0 && expectedLineItems.length > 0) {
    if (extractedLineItems.length === expectedLineItems.length) {
      scorePoints += 15;
    } else {
      scorePoints += 5;
      discrepancies.push({
        field: 'lineItemCount',
        expected: expectedLineItems.length,
        actual: extractedLineItems.length,
        severity: 'low'
      });
    }
  } else {
    scorePoints += 7; // partial
  }

  const matchScore = Math.min(100, Math.round(scorePoints));
  const status = discrepancies.some((d) => d.severity === 'high')
    ? 'rejected'
    : matchScore >= 60
    ? 'validated'
    : 'rejected';

  return {
    status,
    matchScore,
    discrepancies
  };
}

module.exports = { computeFileHash, checkDuplicate, validateAgainstPO };
