/**
 * Express error-handling middleware.
 * Must have 4 arguments to be recognised by Express as an error handler.
 * Attach as the last middleware in app.js.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} —`, err.message)

  // Sequelize validation errors — surface them cleanly
  if (err.name === 'SequelizeValidationError') {
    const messages = err.errors.map(e => e.message)
    return res.status(422).json({ error: 'Validation failed.', details: messages })
  }

  // Sequelize unique constraint
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ error: 'A record with that value already exists.' })
  }

  const status = err.status || 500
  res.status(status).json({
    error: err.message || 'An unexpected error occurred.',
  })
}

module.exports = errorHandler
