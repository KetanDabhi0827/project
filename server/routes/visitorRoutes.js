const express = require('express');
const router = express.Router();
const visitorService = require('../services/visitorService');
const queueService = require('../services/queueService');

/**
 * POST /api/visitors/identify
 * Check if a visitor has visited before based on Name and Phone/Email.
 */
router.post('/identify', async (req, res, next) => {
  try {
    const { name, identifier } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Visitor name is required.' });
    }

    const result = await visitorService.identifyVisitor(name, identifier);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/visitors/withdraw-consent
 * Right to be forgotten: Visitors can withdraw consent using their PIN to purge their photos.
 */
router.post('/withdraw-consent', async (req, res, next) => {
  try {
    const { visitorId, pin } = req.body;
    if (!visitorId || !pin) {
      return res.status(400).json({ success: false, error: 'Visitor ID and PIN are required.' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await visitorService.withdrawConsentAndPurge(visitorId, pin, clientIp);

    // Remove any of their active photos from the display queue in real time
    const photos = await visitorService.getVisitorPhotos(visitorId);
    for (const p of photos) {
      queueService.handlePhotoRemoved(p.id);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/visitors/:id/pass
 * Generates a digital event pass card with QR code for quick returning check-ins
 */
router.get('/:id/pass', async (req, res, next) => {
  try {
    const QRCode = require('qrcode');
    const { getDatabase, getAsync } = require('../db/database');
    const db = getDatabase();
    const visitor = await getAsync(
      db,
      `SELECT id, name, identifier, pin, visit_count, first_visited_at FROM visitors WHERE id = ?`,
      [req.params.id]
    );

    if (!visitor) {
      return res.status(404).json({ success: false, error: 'Visitor not found.' });
    }

    const checkInData = JSON.stringify({
      vId: visitor.id,
      name: visitor.name,
      identifier: visitor.identifier,
      pin: visitor.pin,
    });

    const qrDataUrl = await QRCode.toDataURL(checkInData, {
      width: 220,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });

    res.json({
      success: true,
      pass: {
        id: visitor.id,
        name: visitor.name,
        identifier: visitor.identifier,
        pin: visitor.pin,
        visitCount: visitor.visit_count,
        memberSince: visitor.first_visited_at,
        qrDataUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
