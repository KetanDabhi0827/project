const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../server/app');
const { initSchema, closeDatabase, getDatabase, runAsync } = require('../server/db/database');

describe('Upload API & File Validation', () => {
  const dummyJpg = path.join(__dirname, 'test-image.jpg');
  const dummyTxt = path.join(__dirname, 'test-doc.txt');

  beforeAll(async () => {
    await initSchema();
    const db = getDatabase();
    await runAsync(db, 'DELETE FROM photos');
    await runAsync(db, 'DELETE FROM visitors');
    await runAsync(db, 'DELETE FROM consent_logs');

    // Create a valid dummy image buffer (JPEG SOI & EOI markers)
    const jpgBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
      0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
      0x00, 0x60, 0x00, 0x00, 0xff, 0xd9
    ]);
    fs.writeFileSync(dummyJpg, jpgBuffer);
    fs.writeFileSync(dummyTxt, 'This is an invalid file for slideshow.');
  });

  afterAll(async () => {
    if (fs.existsSync(dummyJpg)) fs.unlinkSync(dummyJpg);
    if (fs.existsSync(dummyTxt)) fs.unlinkSync(dummyTxt);
    await closeDatabase();
  });

  test('should return 400 if visitor name is missing', async () => {
    const res = await request(app)
      .post('/api/upload')
      .field('consentGiven', 'true')
      .attach('photos', dummyJpg);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Visitor name is required/i);
  });

  test('should return 400 if display consent is false or missing', async () => {
    const res = await request(app)
      .post('/api/upload')
      .field('name', 'Bob Test')
      .field('consentGiven', 'false')
      .attach('photos', dummyJpg);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Consent is required/i);
  });

  test('should return 400 when uploading an unsupported file format (.txt)', async () => {
    const res = await request(app)
      .post('/api/upload')
      .field('name', 'Bob Test')
      .field('consentGiven', 'true')
      .attach('photos', dummyTxt);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Unsupported file type/i);
  });

  test('should successfully upload valid image for first visit', async () => {
    const res = await request(app)
      .post('/api/upload')
      .field('name', 'Charlie Brown')
      .field('identifier', 'charlie@peanuts.com')
      .field('consentGiven', 'true')
      .attach('photos', dummyJpg);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.visitor.name).toBe('Charlie Brown');
    expect(res.body.visitor.isReturning).toBe(false);
    expect(res.body.newPhotos.length).toBe(1);
    expect(res.body.pastPhotos.length).toBe(0);
  });

  test('should detect returning visitor on subsequent upload and include past photos', async () => {
    const res = await request(app)
      .post('/api/upload')
      .field('name', 'Charlie Brown')
      .field('identifier', 'charlie@peanuts.com')
      .field('consentGiven', 'true')
      .attach('photos', dummyJpg);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.visitor.isReturning).toBe(true);
    expect(res.body.visitor.visitCount).toBe(2);
    expect(res.body.newPhotos.length).toBe(1);
    expect(res.body.pastPhotos.length).toBeGreaterThanOrEqual(1);
  });
});
