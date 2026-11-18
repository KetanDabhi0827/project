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
 * GET /api/slideshow/settings
 * Returns dynamic event branding and playback settings
 */
router.get('/settings', async (req, res, next) => {
  try {
    const { getDatabase, allAsync } = require('../db/database');
    const db = getDatabase();
    const rows = await allAsync(db, `SELECT key, value FROM slideshow_settings`);
    const settings = {};
    rows.forEach((r) => {
      settings[r.key] = r.value;
    });

    res.json({
      success: true,
      settings: {
        eventName: settings.event_name || 'Live Event Slideshow',
        eventTagline: settings.event_tagline || 'Share your moments on the big screen',
        themeColor: settings.theme_color || 'blue',
        transitionEffect: settings.transition_effect || 'kenburns',
        allowGuestReactions: settings.allow_guest_reactions !== 'false',
        slideDuration: parseInt(settings.slide_duration || '6', 10),
      },
    });
  } catch (err) {
    next(err);
  }
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

/**
 * POST /api/slideshow/prev
 * Steps backward to the previous slide manually.
 */
router.post('/prev', (req, res) => {
  queueService.prev();
  res.json({ success: true, ...queueService.getQueueSummary() });
});

/**
 * POST /api/slideshow/toggle-pause
 */
router.post('/toggle-pause', (req, res) => {
  if (queueService.isPaused) {
    queueService.resume();
  } else {
    queueService.pause();
  }
  res.json({ success: true, isPaused: queueService.isPaused });
});

/**
 * POST /api/slideshow/react
 * Broadcasts an emoji reaction from audience phones to the TV screen
 */
router.post('/react', (req, res) => {
  const { emoji } = req.body;
  const socketService = require('../services/socketService');
  const payload = socketService.broadcastReaction(emoji);
  if (payload) {
    res.json({ success: true, reaction: payload });
  } else {
    res.status(400).json({ success: false, error: 'Invalid or unsupported emoji.' });
  }
});

module.exports = router;
