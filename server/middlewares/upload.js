const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// Ensure directory exists
if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const uniqueFilename = `photo-${uuidv4()}${safeExt}`;
    cb(null, uniqueFilename);
  },
});

function fileFilter(req, file, cb) {
  const allowedTypes = config.allowedMimeTypes;
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];

  if (!allowedTypes.includes(file.mimetype.toLowerCase())) {
    return cb(
      new Error(`Unsupported file type: ${file.mimetype}. Allowed formats: JPG, PNG, WEBP.`),
      false
    );
  }

  if (!allowedExts.includes(ext)) {
    return cb(
      new Error(`Invalid file extension: ${ext}. Allowed extensions: .jpg, .jpeg, .png, .webp.`),
      false
    );
  }

  cb(null, true);
}

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSizeMB * 1024 * 1024, // e.g. 10MB
    files: config.maxFilesPerUpload,              // e.g. 5
  },
  fileFilter,
});

module.exports = upload;
