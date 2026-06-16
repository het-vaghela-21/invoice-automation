const express = require('express');
const router = express.Router();
const { getVendors, getVendor, getVendorSummary, createVendor, updateVendor, deleteVendor } = require('../controllers/vendorController');
const { protect, authorize } = require('../middleware/auth');
const { vendorRules } = require('../validators/vendorValidators');
const { handleValidation } = require('../middleware/validate');

router.use(protect);
// Any authenticated role can read. Creating/editing needs accountant or admin.
// Deleting (which can orphan POs/invoices) is admin-only.
router.route('/').get(getVendors).post(authorize('admin', 'accountant'), vendorRules, handleValidation, createVendor);
router.get('/:id/summary', getVendorSummary);
router.route('/:id')
  .get(getVendor)
  .put(authorize('admin', 'accountant'), vendorRules, handleValidation, updateVendor)
  .delete(authorize('admin'), deleteVendor);

module.exports = router;
