const express = require('express');
const router = express.Router();
const { getPurchaseOrders, getPurchaseOrder, createPurchaseOrder, updatePurchaseOrder, exportPurchaseOrdersCSV } = require('../controllers/purchaseOrderController');
const { protect, authorize } = require('../middleware/auth');
const { createPORules, updatePORules } = require('../validators/purchaseOrderValidators');
const { handleValidation } = require('../middleware/validate');

router.use(protect);
router.route('/').get(getPurchaseOrders).post(authorize('admin', 'accountant'), createPORules, handleValidation, createPurchaseOrder);
// Must be registered before '/:id' for the same reason as in invoiceRoutes.js.
router.get('/export', exportPurchaseOrdersCSV);
router.route('/:id').get(getPurchaseOrder).put(authorize('admin', 'accountant'), updatePORules, handleValidation, updatePurchaseOrder);

module.exports = router;
