const { body } = require('express-validator');

// "admin" is intentionally not an allowed value here — see the comment in
// userController.updateUserRole for why this project keeps a single fixed
// admin account instead of an admin-assignable role.
exports.updateRoleRules = [
  body('role').notEmpty().withMessage('Role is required').bail()
    .isIn(['accountant', 'viewer']).withMessage('Role must be "accountant" or "viewer"'),
];
