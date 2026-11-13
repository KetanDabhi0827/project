const multer = require('multer');

function errorHandler(err, req, res, next) {
  console.error('[Error Middleware]', err.message);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size too large. Maximum allowed size is 10 MB per photo.',
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files uploaded at once. Maximum allowed is 5 photos per upload.',
      });
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
    });
  }

  const statusCode = err.status || 400;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'An unexpected error occurred.',
  });
}

module.exports = errorHandler;
