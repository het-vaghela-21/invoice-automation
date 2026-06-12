const PurchaseOrder = require('../models/PurchaseOrder');

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
    const po = await PurchaseOrder.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('vendor', 'name email');
    if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
    res.json({ success: true, data: po });
  } catch (err) { next(err); }
};
