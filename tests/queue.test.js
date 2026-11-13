const queueService = require('../server/services/queueService');

describe('Slideshow Queue & Concurrency Management', () => {
  const cleanTimers = () => {
    queueService.clearQueue();
    if (queueService.timer) clearTimeout(queueService.timer);
    if (queueService.ambientTimer) clearTimeout(queueService.ambientTimer);
    queueService.currentBatch = null;
    queueService.currentSlide = null;
    queueService.isPaused = false;
  };

  beforeEach(() => {
    cleanTimers();
  });

  afterEach(() => {
    cleanTimers();
  });

  afterAll(() => {
    cleanTimers();
  });

  test('should immediately play incoming batch if queue is idle', () => {
    const batch = queueService.enqueueBatch({
      visitor: { id: 'v1', name: 'Diana Prince', isReturning: false },
      newPhotos: [
        { id: 'p1', url: '/uploads/p1.jpg', originalName: 'p1.jpg' },
        { id: 'p2', url: '/uploads/p2.jpg', originalName: 'p2.jpg' },
      ],
      pastPhotos: [],
    });

    expect(queueService.currentBatch).toBeDefined();
    expect(queueService.currentBatch.visitorName).toBe('Diana Prince');
    expect(queueService.currentSlide).toBeDefined();
    expect(queueService.currentSlide.id).toBe('p1');
    expect(queueService.currentSlide.slideNumber).toBe(1);
    expect(queueService.pendingQueue.length).toBe(0);
  });

  test('should handle concurrent uploads by queueing subsequent batches in FIFO order', () => {
    // Visitor 1 uploads
    queueService.enqueueBatch({
      visitor: { id: 'v1', name: 'Diana Prince' },
      newPhotos: [{ id: 'p1', url: '/uploads/p1.jpg' }],
      pastPhotos: [],
    });

    // Visitor 2 and Visitor 3 upload at the exact same moment
    queueService.enqueueBatch({
      visitor: { id: 'v2', name: 'Bruce Wayne' },
      newPhotos: [{ id: 'p2', url: '/uploads/p2.jpg' }],
      pastPhotos: [],
    });

    queueService.enqueueBatch({
      visitor: { id: 'v3', name: 'Clark Kent' },
      newPhotos: [{ id: 'p3', url: '/uploads/p3.jpg' }],
      pastPhotos: [],
    });

    expect(queueService.currentBatch.visitorName).toBe('Diana Prince');
    expect(queueService.pendingQueue.length).toBe(2);
    expect(queueService.pendingQueue[0].visitorName).toBe('Bruce Wayne');
    expect(queueService.pendingQueue[1].visitorName).toBe('Clark Kent');
  });

  test('should transition to next pending batch in FIFO order when current batch completes', () => {
    // Visitor 1 has 1 photo
    queueService.enqueueBatch({
      visitor: { id: 'v1', name: 'Diana Prince' },
      newPhotos: [{ id: 'p1', url: '/uploads/p1.jpg' }],
      pastPhotos: [],
    });

    // Visitor 2 is waiting
    queueService.enqueueBatch({
      visitor: { id: 'v2', name: 'Bruce Wayne' },
      newPhotos: [{ id: 'p2', url: '/uploads/p2.jpg' }],
      pastPhotos: [],
    });

    expect(queueService.currentBatch.visitorName).toBe('Diana Prince');

    // Slide 1 of Diana finishes
    queueService.next();

    // Now Bruce Wayne should be active
    expect(queueService.currentBatch.visitorName).toBe('Bruce Wayne');
    expect(queueService.currentSlide.id).toBe('p2');
    expect(queueService.pendingQueue.length).toBe(0);
  });

  test('should cap returning visitor past photos to prevent screen monopolization', () => {
    const manyPastPhotos = Array.from({ length: 15 }, (_, i) => ({
      id: `past-${i}`,
      url: `/uploads/past-${i}.jpg`,
      originalName: `past-${i}.jpg`,
    }));

    const batch = queueService.enqueueBatch({
      visitor: { id: 'v-veteran', name: 'Tony Stark', isReturning: true, visitCount: 10 },
      newPhotos: [{ id: 'new-1', url: '/uploads/new-1.jpg' }],
      pastPhotos: manyPastPhotos,
    });

    // Should include at most 5 past photos + 1 new photo = 6 total slides
    expect(batch.totalSlides).toBe(6);
    expect(batch.includedPastPhotos).toBe(5);
  });

  test('should immediately remove a moderated photo from the display', () => {
    queueService.enqueueBatch({
      visitor: { id: 'v1', name: 'Diana Prince' },
      newPhotos: [
        { id: 'flagged-photo', url: '/uploads/flagged.jpg' },
        { id: 'good-photo', url: '/uploads/good.jpg' },
      ],
      pastPhotos: [],
    });

    expect(queueService.currentSlide.id).toBe('flagged-photo');

    // Admin moderates the active photo
    queueService.handlePhotoRemoved('flagged-photo');

    // Should have immediately advanced to good-photo
    expect(queueService.currentSlide.id).toBe('good-photo');
    expect(queueService.currentBatch.slides.find((s) => s.id === 'flagged-photo')).toBeUndefined();
  });
});
