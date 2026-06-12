const express = require('express');
const router = express.Router();
const {
  uploadInvoice, getInvoices, getInvoice, deleteInvoice,
  triggerOCR, updateFields, submitMatching, rejectInvoice
} = require('../controllers/invoiceController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(protect);

router.route('/').get(getInvoices).post(upload.single('invoice'), uploadInvoice);
router.route('/:id').get(getInvoice).delete(deleteInvoice);
router.post('/:id/ocr', triggerOCR);
router.patch('/:id/fields', updateFields);
router.post('/:id/match', submitMatching);
router.post('/:id/reject', rejectInvoice);

module.exports = router;
