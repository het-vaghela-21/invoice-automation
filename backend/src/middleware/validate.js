const { validationResult } = require('express-validator');

/**
 * Runs after an express-validator rule chain. Collects all failures into a
 * single 400 response with field-level messages, instead of letting bad
 * input reach Mongoose and come back as an opaque CastError/ValidationError.
 */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const fieldErrors = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    return res.status(400).json({
      success: false,
      // Existing frontend error handlers just read `message` — surface the first
      // failure there so they show something actionable without changes, while
      // `errors` carries the full field-level detail for anything that wants it.
      message: fieldErrors.map((e) => e.message).join('; '),
      errors: fieldErrors,
    });
  }
  next();
};

module.exports = { handleValidation };
