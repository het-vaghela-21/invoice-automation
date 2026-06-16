const { body } = require('express-validator');

exports.vendorRules = [
  body('name').trim().notEmpty().withMessage('Vendor name is required'),
  body('email').trim().notEmpty().withMessage('Vendor email is required').bail().isEmail().withMessage('Must be a valid email address'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be "active" or "inactive"'),
  body('requiredFields').optional().isArray().withMessage('requiredFields must be an array'),
  body('requiredFields.*.fieldKey').optional().notEmpty().withMessage('Each required field needs a fieldKey'),
];
