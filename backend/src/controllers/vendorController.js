const Vendor = require('../models/Vendor');
const PurchaseOrder = require('../models/PurchaseOrder');
const Invoice = require('../models/Invoice');

exports.getVendors = async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) query.$text = { $search: search };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [vendors, total] = await Promise.all([
      Vendor.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Vendor.countDocuments(query)
    ]);
    res.json({ success: true, data: vendors, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

exports.getVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    res.json({ success: true, data: vendor });
  } catch (err) { next(err); }
};

// Drill-down view for a single vendor: their full PO + invoice history plus
// rolled-up totals, so a vendor isn't just a name in a card grid with no
// way to see what's actually been ordered/billed from them.
exports.getVendorSummary = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const [purchaseOrders, invoices, statusBreakdown] = await Promise.all([
      PurchaseOrder.find({ vendor: vendor._id }).sort({ createdAt: -1 }),
      Invoice.find({ vendor: vendor._id })
        .populate('purchaseOrder', 'poNumber')
        .sort({ createdAt: -1 })
        .select('-ocrText -processingLog -fieldChanges'),
      Invoice.aggregate([
        { $match: { vendor: vendor._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    const totalPOValue = purchaseOrders.reduce((sum, po) => sum + (po.totalAmount || 0), 0);
    const totalInvoiced = invoices.reduce((sum, inv) => {
      const amt = inv.userVerifiedData?.totalAmount ?? inv.extractedData?.totalAmount?.value;
      return sum + (amt ? Number(amt) : 0);
    }, 0);
    const overdueOrOverbudget = invoices.filter((inv) => inv.status === 'review_required' || inv.status === 'rejected').length;

    res.json({
      success: true,
      data: {
        vendor,
        purchaseOrders,
        invoices,
        stats: {
          totalPOs: purchaseOrders.length,
          totalInvoices: invoices.length,
          totalPOValue,
          totalInvoiced,
          flaggedInvoices: overdueOrOverbudget,
          statusBreakdown
        }
      }
    });
  } catch (err) { next(err); }
};

exports.createVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.create(req.body);
    res.status(201).json({ success: true, data: vendor });
  } catch (err) { next(err); }
};

exports.updateVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    res.json({ success: true, data: vendor });
  } catch (err) { next(err); }
};

exports.deleteVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    res.json({ success: true, message: 'Vendor deleted' });
  } catch (err) { next(err); }
};
