/**
 * Extraction Service
 *
 * This service takes raw OCR text and extracts structured invoice fields using
 * regex patterns and heuristic logic.
 *
 * === LayoutLMv3 ML Integration Architecture ===
 * This heuristic extraction layer is designed to be replaced by (or supplemented with)
 * a LayoutLMv3 Python microservice. To integrate:
 *
 *   1. Run a Python FastAPI/Flask service exposing: POST /api/ml/extract
 *      Request body: { text: string, fileBase64?: string }
 *      Response:     { fields: ExtractedData, confidence: FieldConfidences }
 *
 *   2. In this function, replace the heuristic logic with:
 *      const axios = require('axios');
 *      const mlResult = await axios.post(process.env.ML_SERVICE_URL + '/api/ml/extract', { text, fileBase64 });
 *      return mlResult.data;
 *
 *   3. LayoutLMv3 uses both text tokens AND 2D layout (bounding boxes from OCR)
 *      to achieve much higher accuracy on invoice field extraction than regex alone.
 *
 * The response schema from both this service and the ML service is identical,
 * ensuring a seamless swap.
 * =============================================
 */

/**
 * Extract invoice number from text
 * Handles patterns like: Invoice #1234, INV-001, Invoice No: 1234
 */
function extractInvoiceNumber(text) {
  const patterns = [
    /invoice\s*(?:number|no\.?|num\.?|#)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
    /inv[.\-\s]*(?:no\.?|#)?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
    /bill\s*(?:number|no\.?|#)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
    /#\s*([A-Z0-9\-\/]{4,20})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return { value: match[1].trim(), confidence: 85 };
    }
  }
  return { value: null, confidence: 0 };
}

/**
 * Extract vendor/company name
 */
function extractVendorName(text) {
  const patterns = [
    /from\s*[:\-]?\s*([A-Za-z0-9\s&.,'-]{3,50}?)(?:\n|ltd|llc|inc|corp|co\.)/i,
    /billed?\s*(?:from|by)\s*[:\-]?\s*([A-Za-z0-9\s&.,'-]{3,50})/i,
    /seller\s*[:\-]?\s*([A-Za-z0-9\s&.,'-]{3,50})/i,
    /vendor\s*[:\-]?\s*([A-Za-z0-9\s&.,'-]{3,50})/i,
    /^([A-Z][A-Za-z0-9\s&.,'-]{2,40}(?:Ltd|LLC|Inc|Corp|Co\.?))/m
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return { value: match[1].trim(), confidence: 70 };
    }
  }
  return { value: null, confidence: 0 };
}

/**
 * Extract dates — invoice date and due date
 */
function extractDates(text) {
  // Regex patterns for common date formats
  const datePatterns = [
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
    /(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/,
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i,
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})/i
  ];

  const invoiceDatePatterns = [
    /(?:invoice\s*date|date\s*of\s*invoice|bill\s*date|issued?(?:\s+on)?)\s*[:\-]?\s*([\d\/\-\. ]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?[\d\/\-\. ]*)/i,
    /date\s*[:\-]\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i
  ];

  const dueDatePatterns = [
    /(?:due\s*date|payment\s*due|pay\s*by|due\s*by)\s*[:\-]?\s*([\d\/\-\. ]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?[\d\/\-\. ]*)/i
  ];

  let invoiceDate = { value: null, confidence: 0 };
  let dueDate = { value: null, confidence: 0 };

  // Try specific invoice date patterns first
  for (const pattern of invoiceDatePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      invoiceDate = { value: match[1].trim(), confidence: 85 };
      break;
    }
  }

  // Try due date patterns
  for (const pattern of dueDatePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      dueDate = { value: match[1].trim(), confidence: 85 };
      break;
    }
  }

  // Fallback: extract first date found in text as invoice date
  if (!invoiceDate.value) {
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        invoiceDate = { value: match[1].trim(), confidence: 55 };
        break;
      }
    }
  }

  return { invoiceDate, dueDate };
}

/**
 * Extract currency
 */
function extractCurrency(text) {
  const currencyPatterns = [
    /currency\s*[:\-]?\s*([A-Z]{3})/i,
    /\b(USD|EUR|GBP|CAD|AUD|INR|JPY|CHF|CNY)\b/
  ];

  // Symbol-based detection
  if (/\$/.test(text)) return { value: 'USD', confidence: 80 };
  if (/€/.test(text)) return { value: 'EUR', confidence: 80 };
  if (/£/.test(text)) return { value: 'GBP', confidence: 80 };
  if (/₹/.test(text)) return { value: 'INR', confidence: 80 };

  for (const pattern of currencyPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return { value: match[1].toUpperCase(), confidence: 75 };
    }
  }

  return { value: 'USD', confidence: 30 }; // Default fallback
}

/**
 * Extract monetary amounts
 * Returns subTotal, tax, and totalAmount
 */
function extractAmounts(text) {
  // Pattern to match currency amounts: 1,234.56 or 1234.56 or $1,234.56
  const amountPattern = /[\$€£₹]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/;

  const totalPatterns = [
    /(?:total\s*amount|grand\s*total|amount\s*due|total\s*due|balance\s*due)\s*[:\-]?\s*[\$€£₹]?\s*(\d[\d,]*\.?\d*)/i,
    /total\s*[:\-]?\s*[\$€£₹]?\s*(\d[\d,]*\.?\d*)/i
  ];

  const subtotalPatterns = [
    /(?:sub\s*total|subtotal|net\s*amount|amount\s*before\s*tax)\s*[:\-]?\s*[\$€£₹]?\s*(\d[\d,]*\.?\d*)/i
  ];

  const taxPatterns = [
    /(?:tax|vat|gst|hst|sales\s*tax)\s*(?:\(\d+%\))?\s*[:\-]?\s*[\$€£₹]?\s*(\d[\d,]*\.?\d*)/i,
    /(?:tax\s*amount)\s*[:\-]?\s*[\$€£₹]?\s*(\d[\d,]*\.?\d*)/i
  ];

  const parseAmount = (str) => {
    if (!str) return null;
    return parseFloat(str.replace(/,/g, ''));
  };

  let totalAmount = { value: null, confidence: 0 };
  let subTotal = { value: null, confidence: 0 };
  let tax = { value: null, confidence: 0 };

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      totalAmount = { value: parseAmount(match[1]), confidence: 85 };
      break;
    }
  }

  for (const pattern of subtotalPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      subTotal = { value: parseAmount(match[1]), confidence: 80 };
      break;
    }
  }

  for (const pattern of taxPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      tax = { value: parseAmount(match[1]), confidence: 80 };
      break;
    }
  }

  // If we have total and tax but no subtotal, compute it
  if (totalAmount.value && tax.value && !subTotal.value) {
    subTotal = { value: totalAmount.value - tax.value, confidence: 70 };
  }

  // If we have total and subtotal but no tax, compute it
  if (totalAmount.value && subTotal.value && !tax.value) {
    tax = { value: totalAmount.value - subTotal.value, confidence: 70 };
  }

  return { totalAmount, subTotal, tax };
}

/**
 * Extract line items from a table-like structure in the text
 * Looks for rows with description, qty, price patterns
 */
function extractLineItems(text) {
  const lineItems = [];

  // Common line item patterns:
  // "Description    Qty    Unit Price    Total"
  // "Item name      2      $50.00        $100.00"
  const lineItemPattern = /^(.{3,40}?)\s+(\d+(?:\.\d+)?)\s+[\$€£₹]?\s*(\d[\d,.]*)\s+[\$€£₹]?\s*(\d[\d,.]*)\s*$/gm;

  let match;
  let lineNumber = 0;
  while ((match = lineItemPattern.exec(text)) !== null && lineNumber < 20) {
    const description = match[1].trim();
    const quantity = parseFloat(match[2]);
    const unitPrice = parseFloat(match[3].replace(/,/g, ''));
    const totalPrice = parseFloat(match[4].replace(/,/g, ''));

    // Basic sanity check
    if (description.length > 2 && !isNaN(quantity) && !isNaN(unitPrice) && !isNaN(totalPrice)) {
      lineItems.push({
        description,
        quantity,
        unitPrice,
        totalPrice,
        confidence: 75
      });
      lineNumber++;
    }
  }

  return lineItems;
}

/**
 * Main extraction function
 * @param {string} rawText - Raw OCR/PDF text
 * @returns {object} Structured extracted data with confidence scores
 */
function extractInvoiceData(rawText) {
  if (!rawText || rawText.trim().length === 0) {
    return {
      invoiceNumber: { value: null, confidence: 0 },
      vendorName: { value: null, confidence: 0 },
      invoiceDate: { value: null, confidence: 0 },
      dueDate: { value: null, confidence: 0 },
      lineItems: [],
      subTotal: { value: null, confidence: 0 },
      tax: { value: null, confidence: 0 },
      totalAmount: { value: null, confidence: 0 },
      currency: { value: 'USD', confidence: 30 },
      overallConfidence: 0
    };
  }

  const invoiceNumber = extractInvoiceNumber(rawText);
  const vendorName = extractVendorName(rawText);
  const { invoiceDate, dueDate } = extractDates(rawText);
  const { totalAmount, subTotal, tax } = extractAmounts(rawText);
  const currency = extractCurrency(rawText);
  const lineItems = extractLineItems(rawText);

  // Calculate overall confidence as weighted average of key fields
  const keyFields = [invoiceNumber, vendorName, invoiceDate, totalAmount];
  const extractedCount = keyFields.filter((f) => f.value !== null).length;
  const overallConfidence = Math.round(
    keyFields.reduce((sum, f) => sum + f.confidence, 0) / keyFields.length
  );

  return {
    invoiceNumber,
    vendorName,
    invoiceDate,
    dueDate,
    lineItems,
    subTotal,
    tax,
    totalAmount,
    currency,
    overallConfidence,
    extractedFieldCount: extractedCount,
    totalFields: keyFields.length
  };
}

module.exports = { extractInvoiceData };
