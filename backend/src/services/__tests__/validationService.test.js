const { validateAgainstPO } = require('../validationService');

const mockPO = {
  poNumber: 'PO-2026-00001',
  totalAmount: 1000,
  subTotal: 900,
  currency: 'USD',
  lineItems: [{ description: 'Widget' }, { description: 'Gadget' }],
};

const mockVendor = { name: 'Acme Supplies Pvt Ltd' };

describe('validateAgainstPO', () => {
  it('passes a perfect match with a high score and no discrepancies', () => {
    const verifiedData = {
      vendorName: 'Acme Supplies Pvt Ltd',
      poNumber: 'PO-2026-00001',
      totalAmount: 1000,
      subTotal: 900,
      currency: 'USD',
      lineItems: [{ description: 'Widget' }, { description: 'Gadget' }],
    };
    const result = validateAgainstPO(verifiedData, mockPO, mockVendor);
    expect(result.status).toBe('passed');
    expect(result.matchScore).toBe(100);
    expect(result.discrepancies).toHaveLength(0);
  });

  it('flags a vendor name mismatch as a high-severity discrepancy', () => {
    const verifiedData = {
      vendorName: 'Totally Different Company',
      poNumber: 'PO-2026-00001',
      totalAmount: 1000,
    };
    const result = validateAgainstPO(verifiedData, mockPO, mockVendor);
    const vendorIssue = result.discrepancies.find((d) => d.field === 'vendorName');
    expect(vendorIssue).toBeDefined();
    expect(vendorIssue.severity).toBe('high');
    expect(result.status).toBe('review_required');
  });

  it('accepts a vendor name as a fuzzy substring match (legal suffix variation)', () => {
    const verifiedData = {
      vendorName: 'Acme Supplies',
      poNumber: 'PO-2026-00001',
      totalAmount: 1000,
    };
    const result = validateAgainstPO(verifiedData, mockPO, mockVendor);
    expect(result.discrepancies.find((d) => d.field === 'vendorName')).toBeUndefined();
  });

  it('allows total amount within the 5% tolerance band', () => {
    const verifiedData = {
      vendorName: 'Acme Supplies Pvt Ltd',
      poNumber: 'PO-2026-00001',
      totalAmount: 1040, // 4% over PO total of 1000
    };
    const result = validateAgainstPO(verifiedData, mockPO, mockVendor);
    expect(result.discrepancies.find((d) => d.field === 'totalAmount')).toBeUndefined();
  });

  it('flags a total amount more than 10% off as high severity and forces review', () => {
    const verifiedData = {
      vendorName: 'Acme Supplies Pvt Ltd',
      poNumber: 'PO-2026-00001',
      totalAmount: 1200, // 20% over PO total of 1000
    };
    const result = validateAgainstPO(verifiedData, mockPO, mockVendor);
    const amountIssue = result.discrepancies.find((d) => d.field === 'totalAmount');
    expect(amountIssue).toBeDefined();
    expect(amountIssue.severity).toBe('high');
    expect(result.status).toBe('review_required');
  });

  it('flags a moderate total amount overcharge (5-10%) as medium severity, not high', () => {
    const verifiedData = {
      vendorName: 'Acme Supplies Pvt Ltd',
      poNumber: 'PO-2026-00001',
      totalAmount: 1080, // 8% over
    };
    const result = validateAgainstPO(verifiedData, mockPO, mockVendor);
    const amountIssue = result.discrepancies.find((d) => d.field === 'totalAmount');
    expect(amountIssue.severity).toBe('medium');
  });

  it('penalizes a missing total amount as a high-severity discrepancy', () => {
    const verifiedData = {
      vendorName: 'Acme Supplies Pvt Ltd',
      poNumber: 'PO-2026-00001',
      totalAmount: null,
    };
    const result = validateAgainstPO(verifiedData, mockPO, mockVendor);
    const amountIssue = result.discrepancies.find((d) => d.field === 'totalAmount');
    expect(amountIssue).toBeDefined();
    expect(amountIssue.severity).toBe('high');
  });

  it('gives partial credit (does not crash or zero out) when optional fields are simply absent', () => {
    const verifiedData = {
      vendorName: 'Acme Supplies Pvt Ltd',
      poNumber: 'PO-2026-00001',
      totalAmount: 1000,
      // subTotal, currency, lineItems intentionally omitted
    };
    const result = validateAgainstPO(verifiedData, mockPO, mockVendor);
    expect(result.matchScore).toBeGreaterThan(0);
    expect(() => result).not.toThrow();
  });

  it('never returns a match score above 100', () => {
    const verifiedData = {
      vendorName: 'Acme Supplies Pvt Ltd',
      poNumber: 'PO-2026-00001',
      totalAmount: 1000,
      subTotal: 900,
      currency: 'USD',
      lineItems: [{ description: 'Widget' }, { description: 'Gadget' }],
    };
    const result = validateAgainstPO(verifiedData, mockPO, mockVendor);
    expect(result.matchScore).toBeLessThanOrEqual(100);
  });

  it('caps a very low score below 60 to "review_required" even with no single high-severity issue', () => {
    const verifiedData = {
      // Everything present but wrong/absent enough to land under 60 without
      // any individual discrepancy being flagged "high".
      poNumber: 'WRONG-PO',
      totalAmount: null,
    };
    const result = validateAgainstPO(verifiedData, mockPO, mockVendor);
    expect(result.status).toBe('review_required');
  });

  describe('PO status guard (closed/cancelled/draft POs can never produce a fresh "passed")', () => {
    const perfectMatchData = {
      vendorName: 'Acme Supplies Pvt Ltd',
      poNumber: 'PO-2026-00001',
      totalAmount: 1000,
      subTotal: 900,
      currency: 'USD',
      lineItems: [{ description: 'Widget' }, { description: 'Gadget' }],
    };

    it('passes an otherwise-perfect match when the PO is approved', () => {
      const result = validateAgainstPO(perfectMatchData, { ...mockPO, status: 'approved' }, mockVendor);
      expect(result.status).toBe('passed');
      expect(result.discrepancies.find((d) => d.field === 'poStatus')).toBeUndefined();
    });

    it('forces review on an otherwise-perfect match when the PO is already closed', () => {
      // This is the exact scenario invoiceController's auto-close exists to
      // surface: a second invoice landing on a PO a prior invoice already
      // closed out.
      const result = validateAgainstPO(perfectMatchData, { ...mockPO, status: 'closed' }, mockVendor);
      const poStatusIssue = result.discrepancies.find((d) => d.field === 'poStatus');
      expect(poStatusIssue).toBeDefined();
      expect(poStatusIssue.severity).toBe('high');
      expect(poStatusIssue.actual).toBe('closed');
      expect(result.status).toBe('review_required');
    });

    it('forces review on an otherwise-perfect match when the PO is still a draft', () => {
      const result = validateAgainstPO(perfectMatchData, { ...mockPO, status: 'draft' }, mockVendor);
      const poStatusIssue = result.discrepancies.find((d) => d.field === 'poStatus');
      expect(poStatusIssue).toBeDefined();
      expect(poStatusIssue.severity).toBe('high');
      expect(result.status).toBe('review_required');
    });

    it('forces review when the PO is cancelled', () => {
      const result = validateAgainstPO(perfectMatchData, { ...mockPO, status: 'cancelled' }, mockVendor);
      expect(result.status).toBe('review_required');
    });

    it('does not add a poStatus discrepancy when status is absent (backward compatible with callers that omit it)', () => {
      const result = validateAgainstPO(perfectMatchData, mockPO, mockVendor);
      expect(result.discrepancies.find((d) => d.field === 'poStatus')).toBeUndefined();
    });
  });
});
