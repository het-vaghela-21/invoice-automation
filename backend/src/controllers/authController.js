const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.status(statusCode).json({
    success: true,
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role }
  });
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    // Role is intentionally never taken from the request body — self-registration
    // always creates an "accountant" account. Admin/viewer accounts are provisioned
    // directly (see backend/src/utils/seed-test.js), not through the public endpoint,
    // otherwise anyone could register themselves as an admin.
    const user = await User.create({ name, email, password, role: 'accountant' });
    sendToken(user, 201, res);
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    sendToken(user, 200, res);
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// Request a password reset link. Always returns the same generic message
// regardless of whether the email is registered, so this endpoint can't be
// used to enumerate accounts.
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const generic = { success: true, message: 'If that email is registered, a password reset link has been generated.' };

    const user = await User.findOne({ email });
    if (!user) return res.json(generic);

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${rawToken}`;

    // No SMTP/email service is wired up in this project — the link is logged
    // server-side so it's reachable from the terminal in a local demo. Outside
    // production we also hand it back in the response so the UI can show it
    // directly (see ForgotPassword.jsx) instead of requiring server console
    // access. Swap this block out for a real mailer (e.g. nodemailer) before
    // shipping to real users — never return resetUrl in production.
    console.log(`[password reset] ${email} -> ${resetUrl}`);

    if (process.env.NODE_ENV !== 'production') {
      return res.json({ ...generic, resetUrl });
    }
    res.json(generic);
  } catch (err) {
    next(err);
  }
};

// Complete a password reset using the raw token from the emailed/displayed link.
exports.resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired' });
    }

    user.password = password; // re-hashed by the pre('save') hook on User
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    sendToken(user, 200, res);
  } catch (err) {
    next(err);
  }
};
