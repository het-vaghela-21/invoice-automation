const express = require('express');
const router = express.Router();
const { getVendors, getVendor, getVendorSummary, getVendorsAnalytics, createVendor, updateVendor, deleteVendor } = require('../controllers/vendorController');
const { protect, authorize } = require('../middleware/auth');
const { vendorRules } = require('../validators/vendorValidators');
const { handleValidation } = require('../middleware/validate');

router.use(protect);
router.route('/').get(getVendors).post(authorize('admin', 'accountant'), vendorRules, handleValidation, createVendor);
// /analytics must be before /:id so it isn't captured as a vendor ID
router.get('/analytics', getVendorsAnalytics);
router.get('/:id/summary', getVendorSummary);
router.route('/:id')
  .get(getVendor)
  .put(authorize('admin', 'accountant'), vendorRules, handleValidation, updateVendor)
  .delete(authorize('admin'), deleteVendor);

module.exports = router;
