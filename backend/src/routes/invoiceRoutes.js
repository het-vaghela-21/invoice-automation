const express = require('express');
const router = express.Router();
const { uploadInvoice, getInvoices, getInvoice, reprocessInvoice, deleteInvoice } = require('../controllers/invoiceController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(protect);
router.route('/').get(getInvoices).post(upload.single('invoice'), uploadInvoice);
router.route('/:id').get(getInvoice).delete(deleteInvoice);
router.post('/:id/reprocess', reprocessInvoice);

module.exports = router;
