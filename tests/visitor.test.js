const { initSchema, closeDatabase, getDatabase, runAsync } = require('../server/db/database');
const visitorService = require('../server/services/visitorService');

describe('Visitor Service & Identity Resolution', () => {
  beforeAll(async () => {
    await initSchema();
    const db = getDatabase();
    await runAsync(db, 'DELETE FROM photos');
    await runAsync(db, 'DELETE FROM visitors');
    await runAsync(db, 'DELETE FROM consent_logs');
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('should return isReturning = false for an unknown visitor', async () => {
    const result = await visitorService.identifyVisitor('Brand New User', 'newuser@example.com');
    expect(result.isReturning).toBe(false);
    expect(result.visitor).toBeNull();
  });

  test('should register a new visitor and issue a 4-digit PIN', async () => {
    const reg = await visitorService.registerOrUpdateVisitor({
      name: 'Alice Wonder',
      identifier: 'alice@wonderland.io',
      userPin: '4321',
      consentGiven: true,
      clientIp: '127.0.0.1',
    });

    expect(reg.id).toBeDefined();
    expect(reg.name).toBe('Alice Wonder');
    expect(reg.identifier).toBe('alice@wonderland.io');
    expect(reg.pin).toBe('4321');
    expect(reg.isReturning).toBe(false);
    expect(reg.visitCount).toBe(1);
  });

  test('should identify returning visitor with case-insensitive and trimmed name', async () => {
    const lookup = await visitorService.identifyVisitor('  ALICE wonder  ', 'alice@wonderland.io');
    expect(lookup.isReturning).toBe(true);
    expect(lookup.visitor).toBeDefined();
    expect(lookup.visitor.name).toBe('Alice Wonder');
    expect(lookup.visitor.visitCount).toBe(1);
  });

  test('should increment visit count when returning visitor registers again', async () => {
    const returningReg = await visitorService.registerOrUpdateVisitor({
      name: 'Alice Wonder',
      identifier: 'alice@wonderland.io',
      consentGiven: true,
      clientIp: '127.0.0.1',
    });

    expect(returningReg.isReturning).toBe(true);
    expect(returningReg.visitCount).toBe(2);
  });

  test('should reject consent withdrawal if PIN is invalid', async () => {
    const lookup = await visitorService.identifyVisitor('Alice Wonder', 'alice@wonderland.io');
    await expect(
      visitorService.withdrawConsentAndPurge(lookup.visitor.id, '9999', '127.0.0.1')
    ).rejects.toThrow('Invalid PIN');
  });

  test('should allow consent withdrawal and purge data with valid PIN', async () => {
    const lookup = await visitorService.identifyVisitor('Alice Wonder', 'alice@wonderland.io');
    const res = await visitorService.withdrawConsentAndPurge(lookup.visitor.id, '4321', '127.0.0.1');
    expect(res.success).toBe(true);
  });
});
