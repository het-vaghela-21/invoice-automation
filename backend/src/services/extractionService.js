function extractInvoiceNumber(text) {
  const patterns = [
    /invoice\s*(?:number|no\.?|num\.?|#)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
    /inv[.\-\s]*(?:no\.?|#)?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
    /bill\s*(?:number|no\.?|#)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
    /#\s*([A-Z0-9\-\/]{4,20})/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return { value: m[1].trim(), confidence: 85 };
  }
  return { value: null, confidence: 0 };
}

function extractVendorName(text) {
  // Use [ \t] instead of \s so newlines don't bleed into the next line
  const patterns = [
    /from\s*[:\-]?\s*([A-Za-z0-9 \t&.,'-]{3,50}?)(?:\n|ltd|llc|inc|corp|co\.)/i,
    /billed?\s*(?:from|by)\s*[:\-]?\s*([A-Za-z0-9 \t&.,'-]{3,50})/i,
    /seller\s*[:\-]?\s*([A-Za-z0-9 \t&.,'-]{3,50})/i,
    /vendor\s*[:\-]?\s*([A-Za-z0-9 \t&.,'-]{3,50})/i,
    /^([A-Z][A-Za-z0-9 \t&.,'-]{2,40}(?:Ltd|LLC|Inc|Corp|Co\.?))/m
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return { value: m[1].trim(), confidence: 70 };
  }
  return { value: null, confidence: 0 };
}

function extractGSTNumber(text) {
  const gstPattern = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/;
  const m = text.match(gstPattern);
  if (m) return { value: m[1], confidence: 92 };

  const genericPattern = /(?:gst(?:in)?|gstin|tax\s*(?:id|number|no))\s*[:\-#]?\s*([A-Z0-9\-]{8,20})/i;
  const g = text.match(genericPattern);
  if (g?.[1]) return { value: g[1].trim(), confidence: 75 };

  return { value: null, confidence: 0 };
}

function extractPONumber(text) {
  const patterns = [
    /(?:p\.?o\.?\s*(?:number|no\.?|#)?|purchase\s*order\s*(?:number|no\.?|#)?)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
    /\bpo\s*[:\-#]\s*([A-Z0-9\-\/]+)/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return { value: m[1].trim(), confidence: 85 };
  }
  return { value: null, confidence: 0 };
}

function extractBankAccount(text) {
  const patterns = [
    /(?:account\s*(?:number|no\.?|#)|bank\s*account)\s*[:\-]?\s*([0-9X*]{4,20})/i,
    /(?:iban|acc\.?\s*no\.?)\s*[:\-]?\s*([A-Z0-9]{8,30})/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return { value: m[1].trim(), confidence: 80 };
  }
  return { value: null, confidence: 0 };
}

function extractDates(text) {
  const invoiceDatePatterns = [
    /(?:invoice\s*date|date\s*of\s*invoice|bill\s*date|issued?(?:\s+on)?)\s*[:\-]?\s*([\d\/\-\. ]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?[\d\/\-\. ]*)/i,
    /date\s*[:\-]\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i
  ];
  const dueDatePatterns = [
    /(?:due\s*date|payment\s*due|pay\s*by|due\s*by)\s*[:\-]?\s*([\d\/\-\. ]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?[\d\/\-\. ]*)/i
  ];
  const datePatterns = [
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
    /(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/,
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i
  ];

  let invoiceDate = { value: null, confidence: 0 };
  let dueDate = { value: null, confidence: 0 };

  for (const p of invoiceDatePatterns) {
    const m = text.match(p);
    if (m?.[1]) { invoiceDate = { value: m[1].trim(), confidence: 85 }; break; }
  }
  for (const p of dueDatePatterns) {
    const m = text.match(p);
    if (m?.[1]) { dueDate = { value: m[1].trim(), confidence: 85 }; break; }
  }
  if (!invoiceDate.value) {
    for (const p of datePatterns) {
      const m = text.match(p);
      if (m?.[1]) { invoiceDate = { value: m[1].trim(), confidence: 55 }; break; }
    }
  }
  return { invoiceDate, dueDate };
}

function extractCurrency(text) {
  // Symbol checks — must come before generic pattern to avoid false positives
  if (/₹/.test(text))           return { value: 'INR', confidence: 90 };
  if (/\bRs\./.test(text))       return { value: 'INR', confidence: 85 };
  if (/\$/.test(text))          return { value: 'USD', confidence: 80 };
  if (/€/.test(text))           return { value: 'EUR', confidence: 80 };
  if (/£/.test(text))           return { value: 'GBP', confidence: 80 };

  // Explicit "Currency: XXX" label — high confidence
  const labeled = text.match(/currency\s*[:\-]\s*([A-Z]{3})\b/i);
  if (labeled?.[1]) return { value: labeled[1].toUpperCase(), confidence: 90 };

  // Known ISO codes anywhere in text (avoids matching random 3-letter words like TAX)
  const known = text.match(/\b(USD|EUR|GBP|INR|JPY|CAD|AUD|CHF|CNY)\b/);
  if (known?.[1]) return { value: known[1], confidence: 75 };

  return { value: 'USD', confidence: 30 };
}

function extractAmounts(text) {
  const parseAmount = (str) => str ? parseFloat(str.replace(/,/g, '')) : null;

  // Use [^0-9\n]* after label to skip any currency prefix (₹, $, Rs., ¹, etc.)
  const totalPatterns = [
    /(?:total\s*amount|grand\s*total|amount\s*due|total\s*due|balance\s*due)[^0-9\n]*(\d[\d,]*\.?\d*)/i,
    /(?:amount\s*payable|net\s*payable|payable\s*amount)[^0-9\n]*(\d[\d,]*\.?\d*)/i
  ];
  const subtotalPatterns = [
    /(?:sub\s*total|subtotal|net\s*amount|amount\s*before\s*tax)[^0-9\n]*(\d[\d,]*\.?\d*)/i
  ];
  // Word boundaries prevent "gst" from matching inside "GSTIN".
  // Requiring a colon (via [^:\n]*:) prevents percentage specs like "(GST 18%)"
  // from being extracted — only "GST: amount" or "Tax (GST 18%): amount" are valid.
  const taxPatterns = [
    /\b(?:tax\s*amount|tax\s*total)\b[^0-9\n]*(\d[\d,]*\.?\d*)/i,
    /\b(?:tax|vat|gst|hst)\b[^:\n]*:\s*[^0-9\n]*(\d[\d,]*\.?\d*)/i
  ];

  let totalAmount = { value: null, confidence: 0 };
  let subTotal    = { value: null, confidence: 0 };
  let tax         = { value: null, confidence: 0 };

  for (const p of totalPatterns) {
    const m = text.match(p);
    if (m?.[1]) { totalAmount = { value: parseAmount(m[1]), confidence: 85 }; break; }
  }
  for (const p of subtotalPatterns) {
    const m = text.match(p);
    if (m?.[1]) { subTotal = { value: parseAmount(m[1]), confidence: 80 }; break; }
  }
  for (const p of taxPatterns) {
    const m = text.match(p);
    if (m?.[1]) { tax = { value: parseAmount(m[1]), confidence: 80 }; break; }
  }

  if (totalAmount.value && tax.value && !subTotal.value)
    subTotal = { value: +(totalAmount.value - tax.value).toFixed(2), confidence: 70 };
  if (totalAmount.value && subTotal.value && !tax.value)
    tax = { value: +(totalAmount.value - subTotal.value).toFixed(2), confidence: 70 };

  return { totalAmount, subTotal, tax };
}

function extractLineItems(text) {
  const lineItems = [];
  const lineItemPattern = /^(.{3,40}?)\s+(\d+(?:\.\d+)?)\s+[\$€£₹]?\s*(\d[\d,.]*)\s+[\$€£₹]?\s*(\d[\d,.]*)\s*$/gm;
  let match;
  while ((match = lineItemPattern.exec(text)) !== null && lineItems.length < 20) {
    const description = match[1].trim();
    const quantity    = parseFloat(match[2]);
    const unitPrice   = parseFloat(match[3].replace(/,/g, ''));
    const totalPrice  = parseFloat(match[4].replace(/,/g, ''));
    if (description.length > 2 && !isNaN(quantity) && !isNaN(unitPrice) && !isNaN(totalPrice)) {
      lineItems.push({ description, quantity, unitPrice, totalPrice, confidence: 75 });
    }
  }
  return lineItems;
}

function extractInvoiceData(rawText) {
  if (!rawText?.trim()) {
    return {
      invoiceNumber: { value: null, confidence: 0 },
      vendorName:    { value: null, confidence: 0 },
      gstNumber:     { value: null, confidence: 0 },
      poNumber:      { value: null, confidence: 0 },
      invoiceDate:   { value: null, confidence: 0 },
      dueDate:       { value: null, confidence: 0 },
      lineItems:     [],
      subTotal:      { value: null, confidence: 0 },
      tax:           { value: null, confidence: 0 },
      totalAmount:   { value: null, confidence: 0 },
      currency:      { value: 'USD', confidence: 30 },
      bankAccount:   { value: null, confidence: 0 },
      overallConfidence: 0, extractedFieldCount: 0, totalFields: 8
    };
  }

  const invoiceNumber = extractInvoiceNumber(rawText);
  const vendorName    = extractVendorName(rawText);
  const gstNumber     = extractGSTNumber(rawText);
  const poNumber      = extractPONumber(rawText);
  const { invoiceDate, dueDate } = extractDates(rawText);
  const { totalAmount, subTotal, tax } = extractAmounts(rawText);
  const currency    = extractCurrency(rawText);
  const lineItems   = extractLineItems(rawText);
  const bankAccount = extractBankAccount(rawText);

  const keyFields = [invoiceNumber, vendorName, invoiceDate, totalAmount];
  const extractedFieldCount = keyFields.filter((f) => f.value !== null).length;
  const overallConfidence = Math.round(
    keyFields.reduce((sum, f) => sum + f.confidence, 0) / keyFields.length
  );

  return {
    invoiceNumber, vendorName, gstNumber, poNumber,
    invoiceDate, dueDate, lineItems,
    subTotal, tax, totalAmount, currency, bankAccount,
    overallConfidence, extractedFieldCount, totalFields: keyFields.length
  };
}

module.exports = { extractInvoiceData };
