const Invoice = require('../models/Invoice');
const Vendor = require('../models/Vendor');
const PurchaseOrder = require('../models/PurchaseOrder');

exports.getStats = async (req, res, next) => {
  try {
    const [
      totalInvoices,
      validated,
      rejected,
      processing,
      uploaded,
      totalVendors,
      totalPOs,
      recentInvoices,
      statusBreakdown
    ] = await Promise.all([
      Invoice.countDocuments(),
      Invoice.countDocuments({ status: 'validated' }),
      Invoice.countDocuments({ status: 'rejected' }),
      Invoice.countDocuments({ status: 'processing' }),
      Invoice.countDocuments({ status: 'uploaded' }),
      Vendor.countDocuments({ status: 'active' }),
      PurchaseOrder.countDocuments(),
      Invoice.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('vendor', 'name')
        .populate('purchaseOrder', 'poNumber')
        .select('invoiceNumber status validationResult.matchScore createdAt uploadedFile.originalName'),
      Invoice.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        invoices: { total: totalInvoices, validated, rejected, processing, uploaded },
        vendors: totalVendors,
        purchaseOrders: totalPOs,
        recentInvoices,
        statusBreakdown
      }
    });
  } catch (err) { next(err); }
};
