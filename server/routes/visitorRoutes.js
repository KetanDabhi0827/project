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

module.exports = router;
