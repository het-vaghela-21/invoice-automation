const express = require('express');
const router = express.Router();
const { getPurchaseOrders, getPurchaseOrder, createPurchaseOrder, updatePurchaseOrder } = require('../controllers/purchaseOrderController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getPurchaseOrders).post(createPurchaseOrder);
router.route('/:id').get(getPurchaseOrder).put(updatePurchaseOrder);

module.exports = router;
