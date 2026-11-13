const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const photoService = require('./photoService');

class QueueService extends EventEmitter {
  constructor() {
    super();
    this.pendingQueue = [];
    this.currentBatch = null;
    this.currentSlide = null;
    this.timer = null;
    this.isPaused = false;
    this.slideDurationSeconds = config.slideDurationSeconds;
    this.ambientIndex = 0;
    this.ambientPhotos = [];
    this.ambientTimer = null;
  }

  /**
   * Initializes queue and refreshes ambient photos.
   */
  async init() {
    await this.refreshAmbientReel();
    if (!this.currentBatch) {
      this.playAmbientSlide();
    }
  }

  setSlideDuration(seconds) {
    const val = parseInt(seconds, 10);
    if (!isNaN(val) && val >= 2 && val <= 60) {
      this.slideDurationSeconds = val;
      this.emit('settings-changed', { slideDuration: this.slideDurationSeconds });
      return this.slideDurationSeconds;
    }
    return this.slideDurationSeconds;
  }

  getSlideDuration() {
    return this.slideDurationSeconds;
  }

  async refreshAmbientReel() {
    try {
      this.ambientPhotos = await photoService.getAmbientReelPhotos(25);
    } catch (err) {
      console.warn('[QueueService] Could not refresh ambient reel:', err.message);
      this.ambientPhotos = [];
    }
  }

  /**
   * Enqueues an upload batch for slideshow playback.
   */
  enqueueBatch({ visitor, pastPhotos = [], newPhotos = [], batchId }) {
    // Fair-share limitation: cap past photos to prevent monopolization when multiple visitors upload
    const maxPast = 5;
    const selectedPast = pastPhotos.slice(-maxPast);

    const slides = [
      ...selectedPast.map((p, idx) => ({
        id: p.id,
        url: p.url,
        isPast: true,
        visitorId: visitor.id,
        visitorName: visitor.name,
        originalName: p.originalName,
        slideType: 'past_photo',
      })),
      ...newPhotos.map((p, idx) => ({
        id: p.id,
        url: p.url,
        isPast: false,
        visitorId: visitor.id,
        visitorName: visitor.name,
        originalName: p.originalName,
        slideType: 'new_photo',
      })),
    ];

    const batch = {
      id: uuidv4(),
      batchId: batchId || uuidv4(),
      visitorId: visitor.id,
      visitorName: visitor.name,
      isReturning: Boolean(visitor.isReturning || (visitor.visitCount && visitor.visitCount > 1)),
      visitCount: visitor.visitCount || 1,
      totalPastPhotos: pastPhotos.length,
      includedPastPhotos: selectedPast.length,
      newPhotoCount: newPhotos.length,
      totalSlides: slides.length,
      currentSlideIndex: 0,
      slides,
      enqueuedAt: new Date().toISOString(),
    };

    // If currently idle or playing ambient, start immediately
    if (!this.currentBatch) {
      this.startBatch(batch);
    } else {
      // Add to pending FIFO queue
      this.pendingQueue.push(batch);
      this.emit('queue-updated', this.getQueueSummary());
    }

    return batch;
  }

  startBatch(batch) {
    if (this.ambientTimer) {
      clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.currentBatch = batch;
    this.currentBatch.currentSlideIndex = 0;

    // Emit arrival celebration event
    this.emit('visitor-arrived', {
      batchId: batch.batchId,
      visitorName: batch.visitorName,
      isReturning: batch.isReturning,
      visitCount: batch.visitCount,
      newPhotoCount: batch.newPhotoCount,
      pastPhotoCount: batch.includedPastPhotos,
      totalSlides: batch.totalSlides,
    });

    this.playCurrentBatchSlide();
  }

  playCurrentBatchSlide() {
    if (!this.currentBatch) return;

    const { slides, currentSlideIndex, visitorName, isReturning, visitCount } = this.currentBatch;
    const slide = slides[currentSlideIndex];

    this.currentSlide = {
      ...slide,
      slideNumber: currentSlideIndex + 1,
      totalSlides: slides.length,
      visitorName,
      isReturning,
      visitCount,
      duration: this.slideDurationSeconds,
      isAmbient: false,
      timestamp: Date.now(),
    };

    this.emit('slide-change', this.currentSlide);
    this.emit('queue-updated', this.getQueueSummary());

    if (!this.isPaused) {
      this.scheduleNextSlide(this.slideDurationSeconds * 1000);
    }
  }

  scheduleNextSlide(ms) {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.next();
    }, ms);
  }

  next() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.currentBatch) {
      if (this.currentBatch.currentSlideIndex + 1 < this.currentBatch.totalSlides) {
        // Advance to next slide in current batch
        this.currentBatch.currentSlideIndex += 1;
        this.playCurrentBatchSlide();
      } else {
        // Current batch is complete
        this.currentBatch = null;
        if (this.pendingQueue.length > 0) {
          const nextBatch = this.pendingQueue.shift();
          this.startBatch(nextBatch);
        } else {
          // No more active visitor batches -> switch to ambient reel
          this.currentSlide = null;
          this.emit('queue-updated', this.getQueueSummary());
          this.playAmbientSlide();
        }
      }
    } else {
      // Advance ambient reel
      this.playAmbientSlide();
    }
  }

  async playAmbientSlide() {
    if (this.ambientTimer) {
      clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    }

    if (this.ambientPhotos.length === 0) {
      await this.refreshAmbientReel();
    }

    if (this.ambientPhotos.length > 0) {
      const photo = this.ambientPhotos[this.ambientIndex % this.ambientPhotos.length];
      this.ambientIndex++;

      this.currentSlide = {
        id: photo.id,
        url: photo.url,
        visitorName: photo.visitorName,
        isPast: true,
        isAmbient: true,
        slideType: 'ambient',
        duration: config.ambientLoopDurationSeconds,
        timestamp: Date.now(),
      };

      this.emit('slide-change', this.currentSlide);

      if (!this.isPaused && !this.currentBatch) {
        this.ambientTimer = setTimeout(() => {
          if (!this.currentBatch) {
            this.playAmbientSlide();
          }
        }, config.ambientLoopDurationSeconds * 1000);
      }
    } else {
      // Empty state (no photos yet)
      this.currentSlide = {
        isStandby: true,
        isAmbient: true,
        message: 'Scan the QR code to be the first to display your photos!',
        duration: 5,
        timestamp: Date.now(),
      };
      this.emit('slide-change', this.currentSlide);
    }
  }

  pause() {
    this.isPaused = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ambientTimer) {
      clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    }
    this.emit('status-changed', { isPaused: true });
  }

  resume() {
    this.isPaused = false;
    this.emit('status-changed', { isPaused: false });
    if (this.currentBatch) {
      this.playCurrentBatchSlide();
    } else {
      this.playAmbientSlide();
    }
  }

  clearQueue() {
    this.pendingQueue = [];
    this.emit('queue-updated', this.getQueueSummary());
  }

  handlePhotoRemoved(photoId) {
    // If current slide is the removed photo, advance immediately
    if (this.currentSlide && this.currentSlide.id === photoId) {
      this.next();
    }

    // Remove from current batch slides if present
    if (this.currentBatch) {
      this.currentBatch.slides = this.currentBatch.slides.filter((s) => s.id !== photoId);
      this.currentBatch.totalSlides = this.currentBatch.slides.length;
    }

    // Remove from pending queues
    for (const batch of this.pendingQueue) {
      batch.slides = batch.slides.filter((s) => s.id !== photoId);
      batch.totalSlides = batch.slides.length;
    }

    // Remove from ambient photos
    this.ambientPhotos = this.ambientPhotos.filter((p) => p.id !== photoId);

    this.emit('photo-removed', { photoId });
    this.emit('queue-updated', this.getQueueSummary());
  }

  getQueueSummary() {
    return {
      currentBatch: this.currentBatch
        ? {
            visitorName: this.currentBatch.visitorName,
            isReturning: this.currentBatch.isReturning,
            currentSlideIndex: this.currentBatch.currentSlideIndex,
            totalSlides: this.currentBatch.totalSlides,
          }
        : null,
      currentSlide: this.currentSlide,
      pendingCount: this.pendingQueue.length,
      upNext: this.pendingQueue.map((b) => ({
        visitorName: b.visitorName,
        isReturning: b.isReturning,
        slideCount: b.totalSlides,
      })),
      isPaused: this.isPaused,
      slideDuration: this.slideDurationSeconds,
    };
  }
}

module.exports = new QueueService();
