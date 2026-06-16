const { body } = require('express-validator');

exports.updateFieldsRules = [
  body('fields')
    .exists().withMessage('fields object is required')
    .bail()
    .custom((v) => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length > 0)
    .withMessage('fields must be a non-empty object'),
];

exports.uploadRules = [
  body('purchaseOrderId').optional().isMongoId().withMessage('purchaseOrderId must be a valid ID'),
];
