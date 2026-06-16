const express = require('express');
const router = express.Router();
const { register, login, getMe, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { registerRules, loginRules, forgotPasswordRules, resetPasswordRules } = require('../validators/authValidators');
const { handleValidation } = require('../middleware/validate');

router.post('/register', registerRules, handleValidation, register);
router.post('/login', loginRules, handleValidation, login);
router.get('/me', protect, getMe);
router.post('/forgot-password', forgotPasswordRules, handleValidation, forgotPassword);
router.post('/reset-password/:token', resetPasswordRules, handleValidation, resetPassword);

module.exports = router;
