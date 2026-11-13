const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDatabase, runAsync, getAsync, allAsync } = require('../db/database');
const config = require('../config');

class PhotoService {
  /**
   * Records newly uploaded photos for a visitor in the database.
   */
  async saveUploadedPhotos({ visitorId, files, visitBatchId }) {
    const db = getDatabase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.retentionHours * 60 * 60 * 1000).toISOString();
    const createdAt = now.toISOString();

    const savedPhotos = [];

    for (const file of files) {
      const photoId = uuidv4();
      await runAsync(
        db,
        `INSERT INTO photos (id, visitor_id, filename, original_name, mime_type, file_size, is_active, visit_batch_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [
          photoId,
          visitorId,
          file.filename,
          file.originalname || file.filename,
          file.mimetype,
          file.size,
          visitBatchId,
          createdAt,
          expiresAt,
        ]
      );

      savedPhotos.push({
        id: photoId,
        visitorId,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        url: `/uploads/${file.filename}`,
        isPast: false,
        visitBatchId,
        createdAt,
      });
    }

    return savedPhotos;
  }

  /**
   * Fetches previous photos for a visitor, excluding the current batch.
   */
  async getPastPhotos(visitorId, currentBatchId) {
    const db = getDatabase();
    const rows = await allAsync(
      db,
      `SELECT id, visitor_id, filename, original_name, mime_type, file_size, visit_batch_id, created_at
       FROM photos
       WHERE visitor_id = ? AND is_active = 1 AND visit_batch_id != ?
       ORDER BY created_at ASC`,
      [visitorId, currentBatchId]
    );

    return rows.map((row) => ({
      id: row.id,
      visitorId: row.visitor_id,
      filename: row.filename,
      originalName: row.original_name,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      url: `/uploads/${row.filename}`,
      isPast: true,
      visitBatchId: row.visit_batch_id,
      createdAt: row.created_at,
    }));
  }

  /**
   * Fetches active photos for ambient reel display when no active uploads are in queue.
   */
  async getAmbientReelPhotos(limit = 20) {
    const db = getDatabase();
    const rows = await allAsync(
      db,
      `SELECT p.id, p.visitor_id, p.filename, p.original_name, p.created_at, v.name AS visitor_name
       FROM photos p
       JOIN visitors v ON p.visitor_id = v.id
       WHERE p.is_active = 1 AND v.consent_given = 1
       ORDER BY p.created_at DESC
       LIMIT ?`,
      [limit]
    );

    return rows.map((row) => ({
      id: row.id,
      visitorId: row.visitor_id,
      visitorName: row.visitor_name,
      filename: row.filename,
      url: `/uploads/${row.filename}`,
      isPast: true,
      isAmbient: true,
      createdAt: row.created_at,
    }));
  }

  /**
   * Moderates or deactivates a specific photo.
   */
  async deactivatePhoto(photoId, reason = 'Admin moderation') {
    const db = getDatabase();
    const photo = await getAsync(db, `SELECT * FROM photos WHERE id = ?`, [photoId]);
    if (!photo) {
      throw new Error('Photo not found.');
    }

    await runAsync(db, `UPDATE photos SET is_active = 0 WHERE id = ?`, [photoId]);

    // Audit log
    const now = new Date().toISOString();
    await runAsync(
      db,
      `INSERT INTO consent_logs (id, visitor_id, action, ip_hash, timestamp, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), photo.visitor_id, 'PHOTO_MODERATED', 'system', now, `Photo ${photoId} deactivated. Reason: ${reason}`]
    );

    return { success: true, photoId };
  }

  /**
   * Purges expired photos past retention period.
   */
  async purgeExpiredPhotos() {
    const db = getDatabase();
    const now = new Date().toISOString();
    const expiredPhotos = await allAsync(
      db,
      `SELECT id, filename FROM photos WHERE expires_at IS NOT NULL AND expires_at < ? AND is_active = 1`,
      [now]
    );

    for (const photo of expiredPhotos) {
      await runAsync(db, `UPDATE photos SET is_active = 0 WHERE id = ?`, [photo.id]);
      const filePath = path.join(config.uploadsDir, photo.filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.warn(`[PhotoService] Could not unlink file ${filePath}:`, err.message);
        }
      }
    }

    return expiredPhotos.length;
  }
}

module.exports = new PhotoService();
