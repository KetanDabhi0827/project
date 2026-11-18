const path = require('path');
const fs = require('fs');
const aiService = require('../server/services/aiService');

describe('AI Service - Smart Greetings & Safety Analyzer', () => {
  const scratchDir = path.join(__dirname, 'scratch_ai_tests');

  beforeAll(() => {
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  describe('Welcome Greetings Generator', () => {
    test('should generate personalized greeting for a first-time visitor', () => {
      const greeting = aiService.generateWelcomeGreeting({
        visitor: { name: 'Elena Rostova', isReturning: false, visitCount: 1 },
        newPhotosCount: 3,
        pastPhotosCount: 0,
      });

      expect(typeof greeting).toBe('string');
      expect(greeting).toContain('Elena Rostova');
      expect(greeting.length).toBeGreaterThan(15);
    });

    test('should generate celebratory reunion greeting for returning visitor', () => {
      const greeting = aiService.generateWelcomeGreeting({
        visitor: { name: 'Marcus Vance', isReturning: true, visitCount: 4 },
        newPhotosCount: 2,
        pastPhotosCount: 5,
      });

      expect(typeof greeting).toBe('string');
      expect(greeting).toContain('Marcus Vance');
      expect(greeting).toMatch(/Welcome back|VIP Arrival|Great to see you/i);
    });
  });

  describe('Photo Safety & Content Analyzer', () => {
    test('should approve valid benign image buffer', async () => {
      const safeImagePath = path.join(scratchDir, 'valid_pic.jpg');
      // Create a dummy valid JPEG binary header (0xFF 0xD8 0xFF 0xE0)
      const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      fs.writeFileSync(safeImagePath, fakeJpeg);

      const result = await aiService.analyzePhotoSafety(safeImagePath, 'image/jpeg');
      expect(result.isSafe).toBe(true);
      expect(result.label).toContain('AI Safety Verified');
    });

    test('should block executable files disguised as images (MZ header)', async () => {
      const maliciousExePath = path.join(scratchDir, 'trojan.jpg');
      // PE / MZ header
      const exeHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      fs.writeFileSync(maliciousExePath, exeHeader);

      const result = await aiService.analyzePhotoSafety(maliciousExePath, 'image/jpeg');
      expect(result.isSafe).toBe(false);
      expect(result.label).toContain('Executable signature detected');
    });

    test('should block images containing embedded script injection payloads', async () => {
      const xssImagePath = path.join(scratchDir, 'xss_polyglot.png');
      const xssPayload = Buffer.from('GIF89a<script>alert("hacked")</script>');
      fs.writeFileSync(xssImagePath, xssPayload);

      const result = await aiService.analyzePhotoSafety(xssImagePath, 'image/png');
      expect(result.isSafe).toBe(false);
      expect(result.label).toContain('Embedded script payload detected');
    });
  });
});
