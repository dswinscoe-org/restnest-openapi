/**
 * Log Errors
 */
function logErrors(err, req, res, next) {
  console.error(`Error: ${err.stack}`);
  next(err);
}

/**
 * Standard Error Handler
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  if (!err.statusCode) err.statusCode = 500;
  res.setHeader('Content-Type', 'application/json');
  res.status(err.statusCode).json({ error: err.stack.replace(/\n    /g, ', ') });
}

module.exports.logErrors = logErrors;
module.exports.errorHandler = errorHandler;
