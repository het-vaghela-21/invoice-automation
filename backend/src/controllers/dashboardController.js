const Invoice = require('../models/Invoice');
const Vendor = require('../models/Vendor');
const PurchaseOrder = require('../models/PurchaseOrder');

exports.getStats = async (req, res, next) => {
  try {
    const [
      totalInvoices,
      passed,
      rejected,
      reviewRequired,
      pendingReview,
      ocrExtracted,
      uploaded,
      totalVendors,
      totalPOs,
      recentInvoices,
      statusBreakdown
    ] = await Promise.all([
      Invoice.countDocuments(),
      Invoice.countDocuments({ status: 'passed' }),
      Invoice.countDocuments({ status: 'rejected' }),
      Invoice.countDocuments({ status: 'review_required' }),
      Invoice.countDocuments({ status: 'pending_review' }),
      Invoice.countDocuments({ status: 'ocr_extracted' }),
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

    const inProgress = reviewRequired + pendingReview + ocrExtracted;

    res.json({
      success: true,
      data: {
        invoices: {
          total: totalInvoices,
          passed,
          // legacy aliases kept for any old clients
          validated: passed,
          rejected,
          reviewRequired,
          pendingReview,
          ocrExtracted,
          inProgress,
          // legacy alias
          processing: inProgress,
          uploaded,
        },
        vendors: totalVendors,
        purchaseOrders: totalPOs,
        recentInvoices,
        statusBreakdown
      }
    });
  } catch (err) { next(err); }
};
