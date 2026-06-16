const express = require('express');
const router = express.Router();
const { getUsers, updateUserRole } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const { updateRoleRules } = require('../validators/userValidators');
const { handleValidation } = require('../middleware/validate');

// Every route here is admin-only — managing who can do what is an admin task.
router.use(protect, authorize('admin'));

router.get('/', getUsers);
router.patch('/:id/role', updateRoleRules, handleValidation, updateUserRole);

module.exports = router;
