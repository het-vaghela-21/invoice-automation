const { body } = require('express-validator');

exports.createPORules = [
  body('vendor').notEmpty().withMessage('Vendor is required').isMongoId().withMessage('Vendor must be a valid ID'),
  body('lineItems').isArray({ min: 1 }).withMessage('At least one line item is required'),
  body('lineItems.*.description').trim().notEmpty().withMessage('Each line item needs a description'),
  body('lineItems.*.quantity').isFloat({ gt: 0 }).withMessage('Quantity must be greater than 0'),
  body('lineItems.*.unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be 0 or greater'),
  body('taxRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code'),
  body('status').optional().isIn(['draft', 'approved', 'closed', 'cancelled']).withMessage('Invalid status'),
];

// Looser than create: PUT may only be touching status/notes, so fields are
// validated only when present rather than required outright.
exports.updatePORules = [
  body('vendor').optional().isMongoId().withMessage('Vendor must be a valid ID'),
  body('lineItems').optional().isArray({ min: 1 }).withMessage('At least one line item is required'),
  body('lineItems.*.quantity').optional().isFloat({ gt: 0 }).withMessage('Quantity must be greater than 0'),
  body('lineItems.*.unitPrice').optional().isFloat({ min: 0 }).withMessage('Unit price must be 0 or greater'),
  body('taxRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code'),
  body('status').optional().isIn(['draft', 'approved', 'closed', 'cancelled']).withMessage('Invalid status'),
];
