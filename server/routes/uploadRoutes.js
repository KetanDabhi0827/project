const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const upload = require('../middlewares/upload');
const visitorService = require('../services/visitorService');
const photoService = require('../services/photoService');
const queueService = require('../services/queueService');

/**
 * POST /api/upload
 * Handles visitor photo uploads, returning visitor resolution, consent checks, and slideshow queueing.
 */
router.post('/', upload.array('photos', 5), async (req, res, next) => {
  try {
    const { name, identifier, userPin, consentGiven, includePastPhotos } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // 1. Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Visitor name is required.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select at least one photo to upload.' });
    }

    const hasConsent = consentGiven === 'true' || consentGiven === true;
    if (!hasConsent) {
      return res.status(400).json({
        success: false,
        error: 'Consent is required to display your photos on the public slideshow screen.',
      });
    }

    // 2. Register or update visitor record
    const visitor = await visitorService.registerOrUpdateVisitor({
      name: name.trim(),
      identifier: identifier ? identifier.trim() : null,
      userPin,
      consentGiven: true,
      clientIp,
    });

    // 3. Save new photos
    const visitBatchId = uuidv4();
    const newPhotos = await photoService.saveUploadedPhotos({
      visitorId: visitor.id,
      files: req.files,
      visitBatchId,
    });

    // 4. If returning visitor, retrieve their previous photos
    let pastPhotos = [];
    if (visitor.isReturning && includePastPhotos !== 'false') {
      pastPhotos = await photoService.getPastPhotos(visitor.id, visitBatchId);
    }

    // 5. Enqueue into real-time slideshow
    const queuedBatch = queueService.enqueueBatch({
      visitor,
      pastPhotos,
      newPhotos,
      batchId: visitBatchId,
    });

    res.status(201).json({
      success: true,
      message: visitor.isReturning
        ? `Welcome back, ${visitor.name}! Your ${newPhotos.length} new photo(s) and ${pastPhotos.length} past photo(s) are queued for display.`
        : `Welcome, ${visitor.name}! Your ${newPhotos.length} photo(s) are now playing on the screen.`,
      visitor: {
        id: visitor.id,
        name: visitor.name,
        pin: visitor.pin,
        isReturning: visitor.isReturning,
        visitCount: visitor.visitCount,
      },
      newPhotos,
      pastPhotos,
      queueStatus: {
        totalSlidesInBatch: queuedBatch.totalSlides,
        pendingBatchesAhead: queueService.pendingQueue.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
