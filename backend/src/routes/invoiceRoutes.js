const express = require('express');
const router = express.Router();
const {
  uploadInvoice, getInvoices, getInvoice, deleteInvoice,
  triggerOCR, updateFields, submitMatching, rejectInvoice, exportInvoicesCSV
} = require('../controllers/invoiceController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { updateFieldsRules, uploadRules } = require('../validators/invoiceValidators');
const { handleValidation } = require('../middleware/validate');

router.use(protect);

const canEdit = authorize('admin', 'accountant');

// Validation runs after multer (upload.single) so req.body is populated from
// the multipart form by the time uploadRules reads it.
router.route('/').get(getInvoices).post(canEdit, upload.single('invoice'), uploadRules, handleValidation, uploadInvoice);
// Must be registered before '/:id' — otherwise Express would treat "export"
// as an :id value and route it to getInvoice instead.
router.get('/export', exportInvoicesCSV);
router.route('/:id').get(getInvoice).delete(authorize('admin'), deleteInvoice);
router.post('/:id/ocr', canEdit, triggerOCR);
router.patch('/:id/fields', canEdit, updateFieldsRules, handleValidation, updateFields);
router.post('/:id/match', canEdit, submitMatching);
router.post('/:id/reject', canEdit, rejectInvoice);

module.exports = router;
