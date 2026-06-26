const PurchaseOrder = require('../models/PurchaseOrder');
const { toCSV } = require('../utils/csv');

exports.getPurchaseOrders = async (req, res, next) => {
  try {
    const { vendor, status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (vendor) query.vendor = vendor;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [pos, total] = await Promise.all([
      PurchaseOrder.find(query).populate('vendor', 'name email').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      PurchaseOrder.countDocuments(query)
    ]);
    res.json({ success: true, data: pos, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

exports.getPurchaseOrder = async (req, res, next) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id).populate('vendor');
    if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
    res.json({ success: true, data: po });
  } catch (err) { next(err); }
};

exports.createPurchaseOrder = async (req, res, next) => {
  try {
    const { lineItems = [], taxRate = 0, ...rest } = req.body;

    const subTotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const tax = subTotal * (taxRate / 100);
    const totalAmount = subTotal + tax;

    const enrichedItems = lineItems.map(item => ({
      ...item,
      totalPrice: item.quantity * item.unitPrice
    }));

    const po = await PurchaseOrder.create({
      ...rest,
      lineItems: enrichedItems,
      subTotal,
      tax,
      taxRate,
      totalAmount,
      createdBy: req.user._id
    });

    await po.populate('vendor', 'name email');
    res.status(201).json({ success: true, data: po });
  } catch (err) { next(err); }
};

exports.updatePurchaseOrder = async (req, res, next) => {
  try {
    // Strip system-managed fields so callers cannot reopen a closed PO
    // (which would defeat the duplicate-payment protection) or overwrite
    // server-computed totals or the audit trail.
    const { status, subTotal, tax, totalAmount, createdBy, poNumber, ...safeFields } = req.body;
    const po = await PurchaseOrder.findByIdAndUpdate(req.params.id, safeFields, { new: true, runValidators: true }).populate('vendor', 'name email');
    if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
    res.json({ success: true, data: po });
  } catch (err) { next(err); }
};

// Export the (optionally filtered) PO list as CSV — same filters as getPurchaseOrders.
exports.exportPurchaseOrdersCSV = async (req, res, next) => {
  try {
    const { vendor, status } = req.query;
    const query = {};
    if (vendor) query.vendor = vendor;
    if (status) query.status = status;

    const pos = await PurchaseOrder.find(query).populate('vendor', 'name').sort({ createdAt: -1 });

    const columns = [
      { key: (p) => p.poNumber || '', label: 'PO Number' },
      { key: (p) => p.vendor?.name || '', label: 'Vendor' },
      { key: (p) => p.issueDate ? p.issueDate.toISOString().slice(0, 10) : '', label: 'Issue Date' },
      { key: (p) => p.expectedDelivery ? p.expectedDelivery.toISOString().slice(0, 10) : '', label: 'Expected Delivery' },
      { key: (p) => p.lineItems?.length ?? 0, label: 'Line Items' },
      { key: (p) => p.subTotal, label: 'Subtotal' },
      { key: (p) => p.tax, label: 'Tax' },
      { key: (p) => p.totalAmount, label: 'Total Amount' },
      { key: (p) => p.currency, label: 'Currency' },
      { key: (p) => p.status, label: 'Status' },
      { key: (p) => p.createdAt?.toISOString() || '', label: 'Created At' },
    ];

    const csv = toCSV(pos, columns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="purchase-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
};
