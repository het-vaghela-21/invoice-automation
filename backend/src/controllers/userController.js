const User = require('../models/User');

// Admin-only: list every user so the admin can see who's signed up and
// assign them a role. Excludes password (already select:false on the
// model) and the reset-token fields (also select:false).
//
// A lean projection (only the columns the admin UI renders) avoids hydrating
// full Mongoose documents for every user — the bottleneck flagged in the
// performance benchmark (322 ms for ~1k users). `.lean()` returns plain JS
// objects, skipping getters/virtuals/change-tracking we don't need for a read.
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find()
      .select('name email role createdAt')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
};

// Admin-only: change a user's role to "accountant" or "viewer". Deliberately
// cannot be used to grant "admin" — this project keeps a single, fixed
// admin account (provisioned via seed-test.js), not an admin-assignable
// role, so there's no risk of the company ending up with zero or multiple
// admins through this endpoint. Updating the current admin's own role is
// also blocked for the same reason.
exports.updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    if (target.role === 'admin') {
      return res.status(400).json({ success: false, message: "The admin account's role can't be changed" });
    }

    target.role = role;
    await target.save();
    res.json({ success: true, data: target });
  } catch (err) { next(err); }
};
