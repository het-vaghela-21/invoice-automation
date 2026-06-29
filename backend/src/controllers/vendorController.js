const Vendor = require('../models/Vendor');
const PurchaseOrder = require('../models/PurchaseOrder');
const Invoice = require('../models/Invoice');

function computeReliability({ passed, rejected, reviewRequired, totalInvoices, matchScoreSum, matchScoreCount, duplicates }) {
  const processedCount = passed + rejected + reviewRequired;
  if (processedCount < 1) return { reliabilityScore: null, processedCount, passRate: null, rejectionRate: null, avgMatchScore: null };

  const passRate = Math.round((passed / processedCount) * 100);
  const rejectionRate = Math.round((rejected / processedCount) * 100);
  const avgMatchScore = matchScoreCount > 0 ? Math.round(matchScoreSum / matchScoreCount) : null;
  const dupRate = totalInvoices > 0 ? duplicates / totalInvoices : 0;

  const pr = passed / processedCount;
  const ms = (avgMatchScore ?? 50) / 100;
  const dr = Math.max(0, 1 - dupRate * 3);
  const reliabilityScore = Math.round(Math.min(100, Math.max(0, pr * 60 + ms * 30 + dr * 10)));

  return { reliabilityScore, processedCount, passRate, rejectionRate, avgMatchScore };
}

exports.getVendors = async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ name: re }, { email: re }, { taxId: re }];
    }

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

// Lightweight per-vendor analytics for the vendors list page.
// One aggregate across all invoices, grouped by vendor.
exports.getVendorsAnalytics = async (req, res, next) => {
  try {
    const rows = await Invoice.aggregate([
      { $match: { vendor: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$vendor',
          total: { $sum: 1 },
          passed: { $sum: { $cond: [{ $eq: ['$status', 'passed'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          reviewRequired: { $sum: { $cond: [{ $eq: ['$status', 'review_required'] }, 1, 0] } },
          duplicates: {
            $sum: {
              $cond: [
                { $eq: ['$validationResult.duplicateCheck.isDuplicate', true] },
                1, 0
              ]
            }
          },
          matchScoreSum: {
            $sum: {
              $cond: [{ $gt: ['$validationResult.matchScore', 0] }, '$validationResult.matchScore', 0]
            }
          },
          matchScoreCount: {
            $sum: { $cond: [{ $gt: ['$validationResult.matchScore', 0] }, 1, 0] }
          },
          highRisk: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } },
        }
      }
    ]);

    const data = rows.map(v => {
      const rel = computeReliability({
        passed: v.passed,
        rejected: v.rejected,
        reviewRequired: v.reviewRequired,
        totalInvoices: v.total,
        matchScoreSum: v.matchScoreSum,
        matchScoreCount: v.matchScoreCount,
        duplicates: v.duplicates,
      });
      return {
        vendorId: v._id,
        total: v.total,
        passed: v.passed,
        rejected: v.rejected,
        reviewRequired: v.reviewRequired,
        duplicates: v.duplicates,
        highRisk: v.highRisk,
        ...rel,
      };
    });

    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// Drill-down view for a single vendor: full PO + invoice history plus
// rolled-up totals and analytics for the auditing team.
exports.getVendorSummary = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const vendorId = vendor._id;

    const [purchaseOrders, invoices, statusBreakdown, riskBreakdown, discrepancyAgg, monthlyTrend] = await Promise.all([
      PurchaseOrder.find({ vendor: vendorId }).sort({ createdAt: -1 }),
      Invoice.find({ vendor: vendorId })
        .populate('purchaseOrder', 'poNumber')
        .sort({ createdAt: -1 })
        .select('-ocrText -processingLog -fieldChanges'),
      Invoice.aggregate([
        { $match: { vendor: vendorId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Invoice.aggregate([
        { $match: { vendor: vendorId } },
        { $group: { _id: '$riskLevel', count: { $sum: 1 } } }
      ]),
      Invoice.aggregate([
        { $match: { vendor: vendorId, 'validationResult.discrepancies.0': { $exists: true } } },
        { $unwind: '$validationResult.discrepancies' },
        { $group: { _id: '$validationResult.discrepancies.field', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      Invoice.aggregate([
        {
          $match: {
            vendor: vendorId,
            createdAt: { $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            total: { $sum: 1 },
            passed: { $sum: { $cond: [{ $eq: ['$status', 'passed'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    const totalPOValue = purchaseOrders.reduce((sum, po) => sum + (po.totalAmount || 0), 0);
    const totalInvoiced = invoices.reduce((sum, inv) => {
      const amt = inv.userVerifiedData?.totalAmount ?? inv.extractedData?.totalAmount?.value;
      return sum + (amt ? Number(amt) : 0);
    }, 0);

    const statusMap = Object.fromEntries(statusBreakdown.map(s => [s._id, s.count]));
    const passed = statusMap.passed || 0;
    const rejected = statusMap.rejected || 0;
    const reviewRequired = statusMap.review_required || 0;

    const matchScores = invoices
      .map(inv => inv.validationResult?.matchScore)
      .filter(s => s != null && s > 0);
    const matchScoreSum = matchScores.reduce((a, b) => a + b, 0);
    const matchScoreCount = matchScores.length;
    const duplicates = invoices.filter(inv => inv.validationResult?.duplicateCheck?.isDuplicate).length;

    const analytics = computeReliability({
      passed, rejected, reviewRequired,
      totalInvoices: invoices.length,
      matchScoreSum, matchScoreCount, duplicates,
    });

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
          flaggedInvoices: reviewRequired + rejected,
          statusBreakdown,
          // Analytics
          ...analytics,
          passed,
          rejected,
          reviewRequired,
          duplicateCount: duplicates,
          riskBreakdown,
          topDiscrepancies: discrepancyAgg,
          monthlyTrend,
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
