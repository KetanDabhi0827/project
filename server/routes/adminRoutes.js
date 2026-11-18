const express = require('express');
const router = express.Router();
const config = require('../config');
const { getDatabase, allAsync } = require('../db/database');
const photoService = require('../services/photoService');
const queueService = require('../services/queueService');

// Middleware to check admin API key
function checkAdminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.adminKey || req.body.adminKey;
  if (!key || key !== config.adminApiKey) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin API key.' });
  }
  next();
}

router.use(checkAdminAuth);

/**
 * GET /api/admin/visitors
 */
router.get('/visitors', async (req, res, next) => {
  try {
    const db = getDatabase();
    const visitors = await allAsync(
      db,
      `SELECT id, name, identifier, visit_count, consent_given, consent_timestamp, first_visited_at, last_visited_at
       FROM visitors
       ORDER BY last_visited_at DESC`
    );
    res.json({ success: true, visitors });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/photos
 */
router.get('/photos', async (req, res, next) => {
  try {
    const db = getDatabase();
    const photos = await allAsync(
      db,
      `SELECT p.*, v.name AS visitor_name
       FROM photos p
       JOIN visitors v ON p.visitor_id = v.id
       ORDER BY p.created_at DESC`
    );
    res.json({
      success: true,
      photos: photos.map((p) => ({
        ...p,
        url: `/uploads/${p.filename}`,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/moderate-photo
 * Immediately hides an inappropriate photo and removes it from the screen.
 */
router.post('/moderate-photo', async (req, res, next) => {
  try {
    const { photoId, reason } = req.body;
    if (!photoId) {
      return res.status(400).json({ success: false, error: 'photoId is required.' });
    }

    const result = await photoService.deactivatePhoto(photoId, reason || 'Flagged by Moderator');
    queueService.handlePhotoRemoved(photoId);

    res.json({ success: true, message: 'Photo successfully moderated and removed from display.', ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/skip
 */
router.post('/skip', (req, res) => {
  queueService.next();
  res.json({ success: true, message: 'Skipped to next slide.' });
});

/**
 * POST /api/admin/prev
 */
router.post('/prev', (req, res) => {
  queueService.prev();
  res.json({ success: true, message: 'Returned to previous slide.' });
});

/**
 * POST /api/admin/pause
 */
router.post('/pause', (req, res) => {
  queueService.pause();
  res.json({ success: true, message: 'Slideshow paused.' });
});

/**
 * POST /api/admin/resume
 */
router.post('/resume', (req, res) => {
  queueService.resume();
  res.json({ success: true, message: 'Slideshow resumed.' });
});

/**
 * POST /api/admin/duration
 */
router.post('/duration', (req, res) => {
  const { seconds } = req.body;
  const newDuration = queueService.setSlideDuration(seconds);
  res.json({ success: true, slideDuration: newDuration });
});

/**
 * POST /api/admin/clear-queue
 */
router.post('/clear-queue', (req, res) => {
  queueService.clearQueue();
  res.json({ success: true, message: 'Queue cleared.' });
});

/**
 * POST /api/admin/settings
 * Updates event branding, colors, transitions, and reactions toggle
 */
router.post('/settings', async (req, res, next) => {
  try {
    const { eventName, eventTagline, themeColor, transitionEffect, allowGuestReactions, slideDuration } = req.body;
    const { runAsync } = require('../db/database');
    const db = getDatabase();

    if (eventName !== undefined) {
      await runAsync(db, `INSERT OR REPLACE INTO slideshow_settings (key, value) VALUES ('event_name', ?)`, [eventName.trim()]);
    }
    if (eventTagline !== undefined) {
      await runAsync(db, `INSERT OR REPLACE INTO slideshow_settings (key, value) VALUES ('event_tagline', ?)`, [eventTagline.trim()]);
    }
    if (themeColor !== undefined) {
      await runAsync(db, `INSERT OR REPLACE INTO slideshow_settings (key, value) VALUES ('theme_color', ?)`, [themeColor.trim()]);
    }
    if (transitionEffect !== undefined) {
      await runAsync(db, `INSERT OR REPLACE INTO slideshow_settings (key, value) VALUES ('transition_effect', ?)`, [transitionEffect.trim()]);
    }
    if (allowGuestReactions !== undefined) {
      await runAsync(db, `INSERT OR REPLACE INTO slideshow_settings (key, value) VALUES ('allow_guest_reactions', ?)`, [allowGuestReactions.toString()]);
    }
    if (slideDuration !== undefined) {
      queueService.setSlideDuration(slideDuration);
      await runAsync(db, `INSERT OR REPLACE INTO slideshow_settings (key, value) VALUES ('slide_duration', ?)`, [slideDuration.toString()]);
    }

    const socketService = require('../services/socketService');
    const io = socketService.getIO();
    if (io) {
      io.emit('slideshow:branding-update', {
        eventName,
        eventTagline,
        themeColor,
        transitionEffect,
        allowGuestReactions,
        slideDuration,
      });
    }

    res.json({ success: true, message: 'Event branding and settings updated successfully.' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/audit-logs
 */
router.get('/audit-logs', async (req, res, next) => {
  try {
    const db = getDatabase();
    const logs = await allAsync(
      db,
      `SELECT * FROM consent_logs ORDER BY timestamp DESC LIMIT 100`
    );
    res.json({ success: true, logs });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
