const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database path
  dbPath: process.env.DB_PATH || path.join(__dirname, '../data/slideshow.db'),
  
  // Slideshow timings (in seconds)
  slideDurationSeconds: parseInt(process.env.SLIDESHOW_DURATION_SECONDS || '6', 10),
  ambientLoopDurationSeconds: parseInt(process.env.AMBIENT_LOOP_DURATION_SECONDS || '8', 10),
  
  // Upload restrictions
  maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),
  maxFilesPerUpload: parseInt(process.env.MAX_FILES_PER_UPLOAD || '5', 10),
  allowedMimeTypes: (process.env.ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/webp')
    .split(',')
    .map(t => t.trim().toLowerCase()),
  
  // Privacy & retention
  retentionHours: parseInt(process.env.RETENTION_HOURS || '24', 10),
  requireConsent: process.env.REQUIRE_CONSENT !== 'false',
  
  // Admin authentication
  adminApiKey: process.env.ADMIN_API_KEY || 'admin123',
  
  // Storage paths
  uploadsDir: path.join(__dirname, '../public/uploads'),
  publicDir: path.join(__dirname, '../public'),
};

module.exports = config;
