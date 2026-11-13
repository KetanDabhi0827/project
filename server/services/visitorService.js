const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { getDatabase, runAsync, getAsync, allAsync } = require('../db/database');

function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') return '';
  return identifier.trim().toLowerCase();
}

function generatePin() {
  // Generate a friendly 4-digit numeric PIN for visitor data self-management
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function hashIp(ip) {
  if (!ip) return 'unknown';
  return crypto.createHash('sha256').update(ip + '-visitor-salt').digest('hex').substring(0, 16);
}

class VisitorService {
  /**
   * Identifies if a visitor has visited before by checking name and unique identifier.
   */
  async identifyVisitor(name, identifier) {
    const db = getDatabase();
    const cleanName = normalizeName(name);
    const cleanId = normalizeIdentifier(identifier);

    if (!cleanName) {
      throw new Error('Visitor name is required.');
    }

    if (!cleanId) {
      // Name only lookup (fallback if identifier not provided yet)
      const matches = await allAsync(
        db,
        `SELECT id, name, identifier, visit_count, last_visited_at FROM visitors WHERE normalized_name = ?`,
        [cleanName]
      );

      if (matches.length === 1) {
        const pastPhotos = await this.getVisitorPhotos(matches[0].id);
        return {
          isReturning: true,
          matchType: 'name_exact',
          visitor: matches[0],
          pastPhotos,
        };
      }
      return { isReturning: false, matchesCount: matches.length };
    }

    const visitor = await getAsync(
      db,
      `SELECT * FROM visitors WHERE normalized_name = ? AND identifier = ?`,
      [cleanName, cleanId]
    );

    if (visitor) {
      const pastPhotos = await this.getVisitorPhotos(visitor.id);
      return {
        isReturning: true,
        matchType: 'name_and_identifier',
        visitor: {
          id: visitor.id,
          name: visitor.name,
          identifier: visitor.identifier,
          visitCount: visitor.visit_count,
          firstVisitedAt: visitor.first_visited_at,
          lastVisitedAt: visitor.last_visited_at,
        },
        pastPhotos,
      };
    }

    return {
      isReturning: false,
      matchType: 'none',
      visitor: null,
      pastPhotos: [],
    };
  }

  /**
   * Registers a new visitor or updates a returning visitor's metadata.
   */
  async registerOrUpdateVisitor({ name, identifier, userPin, consentGiven = true, clientIp }) {
    const db = getDatabase();
    const cleanName = normalizeName(name);
    const cleanId = normalizeIdentifier(identifier || 'guest-' + Date.now());
    const now = new Date().toISOString();
    const ipHash = hashIp(clientIp);

    if (!cleanName) {
      throw new Error('Visitor name is required.');
    }

    if (!consentGiven) {
      throw new Error('Display consent is mandatory to participate in the public slideshow.');
    }

    // Check if visitor exists
    const existing = await getAsync(
      db,
      `SELECT * FROM visitors WHERE normalized_name = ? AND identifier = ?`,
      [cleanName, cleanId]
    );

    if (existing) {
      // Returning visitor: increment visit count and update timestamp
      await runAsync(
        db,
        `UPDATE visitors SET visit_count = visit_count + 1, last_visited_at = ?, consent_given = 1, consent_timestamp = ? WHERE id = ?`,
        [now, now, existing.id]
      );

      // Audit consent log
      await runAsync(
        db,
        `INSERT INTO consent_logs (id, visitor_id, action, ip_hash, timestamp, details) VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), existing.id, 'RETURNING_VISIT_CONSENT', ipHash, now, `Visit count: ${existing.visit_count + 1}`]
      );

      return {
        id: existing.id,
        name: existing.name,
        identifier: existing.identifier,
        pin: existing.pin,
        isReturning: true,
        visitCount: existing.visit_count + 1,
      };
    }

    // New visitor registration
    const visitorId = uuidv4();
    const pin = (userPin && userPin.trim()) ? userPin.trim() : generatePin();

    await runAsync(
      db,
      `INSERT INTO visitors (id, name, normalized_name, identifier, pin, consent_given, consent_timestamp, visit_count, first_visited_at, last_visited_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, 1, ?, ?)`,
      [visitorId, name.trim(), cleanName, cleanId, pin, now, now, now]
    );

    // Audit initial consent
    await runAsync(
      db,
      `INSERT INTO consent_logs (id, visitor_id, action, ip_hash, timestamp, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), visitorId, 'INITIAL_CONSENT_GRANTED', ipHash, now, 'Consent granted during first registration']
    );

    return {
      id: visitorId,
      name: name.trim(),
      identifier: cleanId,
      pin,
      isReturning: false,
      visitCount: 1,
    };
  }

  /**
   * Retrieves all active photos for a given visitor.
   */
  async getVisitorPhotos(visitorId) {
    const db = getDatabase();
    return allAsync(
      db,
      `SELECT id, visitor_id, filename, original_name, mime_type, file_size, visit_batch_id, created_at
       FROM photos
       WHERE visitor_id = ? AND is_active = 1
       ORDER BY created_at ASC`,
      [visitorId]
    );
  }

  /**
   * Deletes or deactivates visitor photos and logs consent withdrawal (Right to be Forgotten).
   */
  async withdrawConsentAndPurge(visitorId, pin, clientIp) {
    const db = getDatabase();
    const visitor = await getAsync(db, `SELECT * FROM visitors WHERE id = ?`, [visitorId]);

    if (!visitor) {
      throw new Error('Visitor not found.');
    }

    if (visitor.pin !== pin) {
      throw new Error('Invalid PIN. Consent withdrawal denied.');
    }

    const now = new Date().toISOString();
    const ipHash = hashIp(clientIp);

    // Soft delete photos
    await runAsync(db, `UPDATE photos SET is_active = 0 WHERE visitor_id = ?`, [visitorId]);

    // Update visitor consent status
    await runAsync(db, `UPDATE visitors SET consent_given = 0 WHERE id = ?`, [visitorId]);

    // Audit log
    await runAsync(
      db,
      `INSERT INTO consent_logs (id, visitor_id, action, ip_hash, timestamp, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), visitorId, 'CONSENT_WITHDRAWN_PURGE', ipHash, now, 'Visitor self-withdrew consent via PIN']
    );

    return { success: true, message: 'All photos removed from slideshow and consent withdrawn.' };
  }
}

module.exports = new VisitorService();
