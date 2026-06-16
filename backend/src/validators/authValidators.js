const { body } = require('express-validator');

// Note: "role" is deliberately not validated/accepted here — authController.register
// always forces role to "accountant" server-side, regardless of what's submitted.
exports.registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().notEmpty().withMessage('Email is required').bail().isEmail().withMessage('Must be a valid email address').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

exports.loginRules = [
  body('email').trim().notEmpty().withMessage('Email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

exports.forgotPasswordRules = [
  body('email').trim().notEmpty().withMessage('Email is required').bail().isEmail().withMessage('Must be a valid email address').normalizeEmail(),
];

exports.resetPasswordRules = [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];
