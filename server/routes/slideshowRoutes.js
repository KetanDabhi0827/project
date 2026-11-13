const express = require('express');
const router = express.Router();
const os = require('os');
const QRCode = require('qrcode');
const queueService = require('../services/queueService');
const config = require('../config');

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4 and non-internal (e.g. 192.168.x.x, 10.x.x.x)
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

/**
 * GET /api/slideshow/state
 * Returns current playing slide, queue summary, duration, and pause status.
 */
router.get('/state', (req, res) => {
  res.json({
    success: true,
    ...queueService.getQueueSummary(),
  });
});

/**
 * GET /api/slideshow/qr
 * Generates a QR code for smart TVs linking directly to the visitor upload URL.
 */
router.get('/qr', async (req, res, next) => {
  try {
    const hostIp = getLocalIpAddress();
    const port = config.port;
    const uploadUrl = `http://${hostIp}:${port}/`;

    const qrDataUrl = await QRCode.toDataURL(uploadUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    res.json({
      success: true,
      url: uploadUrl,
      qrDataUrl,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/slideshow/next
 * Advances to the next slide manually.
 */
router.post('/next', (req, res) => {
  queueService.next();
  res.json({ success: true, ...queueService.getQueueSummary() });
});

module.exports = router;
