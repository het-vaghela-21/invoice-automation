const { extractInvoiceData } = require('../extractionService');

/**
 * These cases aren't hypothetical — each one reproduces a real bug found and
 * fixed while building the OCR pipeline (see docs/ARCHITECTURE.md §5). They
 * exist to make sure none of them regress silently in a future refactor.
 */
describe('extractInvoiceData', () => {
  describe('vendor name extraction', () => {
    it('does not bleed the next line (address) into the vendor name', () => {
      // Bug: a `\s` character class in the capture group matched newlines,
      // so "Vendor: Acme Supplies Pvt Ltd\n123 Main St" extracted the whole
      // two-line block as the vendor name instead of stopping at the line break.
      const text = 'Vendor: Acme Supplies Pvt Ltd\n123 Main St, Mumbai, India';
      const result = extractInvoiceData(text);
      expect(result.vendorName.value).toBe('Acme Supplies Pvt Ltd');
      expect(result.vendorName.value).not.toMatch(/Main St/);
    });

    it('extracts a vendor name introduced with "From:"', () => {
      const text = 'From: TechCorp Solutions\n500 Market St, San Francisco';
      const result = extractInvoiceData(text);
      expect(result.vendorName.value).toBe('TechCorp Solutions');
    });
  });

  describe('currency detection', () => {
    it('detects INR from "Rs." even though the text also says "TAX INVOICE"', () => {
      // Bug: a permissive currency regex matched the literal word "TAX" out of
      // the "TAX INVOICE" header and returned currency: "TAX" instead of a
      // real ISO code.
      const text = 'TAX INVOICE\nGST: Rs.8640.00\nTotal Amount: Rs.56640.00';
      const result = extractInvoiceData(text);
      expect(result.currency.value).toBe('INR');
      expect(result.currency.value).not.toBe('TAX');
    });

    it('detects INR from the ₹ symbol', () => {
      const text = 'Total Amount: ₹56640.00';
      const result = extractInvoiceData(text);
      expect(result.currency.value).toBe('INR');
    });

    it('detects USD from the $ symbol', () => {
      const text = 'TAX INVOICE\nTotal Amount: $500.00';
      const result = extractInvoiceData(text);
      expect(result.currency.value).toBe('USD');
    });

    it('never returns a non-ISO word like "TAX" as the currency', () => {
      const text = 'TAX INVOICE\nSubtotal: 100.00\nTotal: 118.00';
      const result = extractInvoiceData(text);
      expect(result.currency.value).not.toBe('TAX');
    });
  });

  describe('tax amount extraction', () => {
    it('does not capture the GSTIN state-code digits as the tax amount', () => {
      // Bug: `/(?:tax|vat|gst|hst)[^:\n]*:\s*(\d...)/` lacked a word boundary,
      // so "gst" matched inside "GSTIN", and the regex captured "27" (the
      // leading state code of the GSTIN) as the tax amount.
      const text = 'GSTIN: 27AABCA1234A1Z5\nGST: Rs.8640.00\nTotal Amount: Rs.56640.00';
      const result = extractInvoiceData(text);
      expect(result.tax.value).toBe(8640);
      expect(result.tax.value).not.toBe(27);
    });

    it('extracts an explicit "Tax Amount:" label', () => {
      const text = 'Subtotal: 1000.00\nTax Amount: 180.00\nTotal Amount: 1180.00';
      const result = extractInvoiceData(text);
      expect(result.tax.value).toBe(180);
    });

    it('does not extract a tax value from a bare percentage spec with no colon', () => {
      const text = 'Tax (GST 18%)\nTotal Amount: 1180.00';
      const result = extractInvoiceData(text);
      // No "label: amount" pair exists, so tax should stay unknown rather than
      // misreading "18" (the percentage) as a currency amount.
      expect(result.tax.value).toBeNull();
    });
  });

  describe('amount extraction', () => {
    it('extracts total, subtotal, and tax from a clean labeled invoice', () => {
      const text = 'Subtotal: Rs.48000.00\nGST: Rs.8640.00\nTotal Amount: Rs.56640.00';
      const result = extractInvoiceData(text);
      expect(result.subTotal.value).toBe(48000);
      expect(result.tax.value).toBe(8640);
      expect(result.totalAmount.value).toBe(56640);
    });

    it('derives subtotal from total minus tax when subtotal is not labeled', () => {
      const text = 'Tax Amount: 180.00\nTotal Amount: 1180.00';
      const result = extractInvoiceData(text);
      expect(result.subTotal.value).toBeCloseTo(1000, 2);
    });
  });

  describe('invoice number extraction', () => {
    it('extracts a labeled invoice number', () => {
      const text = 'Invoice Number: INV-2026-0042\nDate: 01/01/2026';
      const result = extractInvoiceData(text);
      expect(result.invoiceNumber.value).toBe('INV-2026-0042');
    });
  });

  describe('GST number extraction', () => {
    it('extracts a well-formed Indian GSTIN with high confidence', () => {
      const text = 'GSTIN: 27AABCA1234A1Z5';
      const result = extractInvoiceData(text);
      expect(result.gstNumber.value).toBe('27AABCA1234A1Z5');
      expect(result.gstNumber.confidence).toBeGreaterThanOrEqual(90);
    });
  });

  describe('empty / missing input', () => {
    it('returns an all-null result without throwing on empty text', () => {
      const result = extractInvoiceData('');
      expect(result.vendorName.value).toBeNull();
      expect(result.totalAmount.value).toBeNull();
      expect(result.extractedFieldCount).toBe(0);
    });

    it('does not throw on whitespace-only text', () => {
      expect(() => extractInvoiceData('   \n\n  ')).not.toThrow();
    });
  });
});
