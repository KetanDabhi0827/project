// TV Slideshow Controller with Real-time WebSocket synchronization

const socket = io();

// DOM Elements
const backgroundBlur = document.getElementById('backgroundBlur');
const slideImage = document.getElementById('slideImage');
const standbyCard = document.getElementById('standbyCard');
const qrCodeImg = document.getElementById('qrCodeImg');
const qrUrlText = document.getElementById('qrUrlText');
const bottomOverlay = document.getElementById('bottomOverlay');
const visitorNameHeading = document.getElementById('visitorNameHeading');
const visitorNameText = document.getElementById('visitorNameText');
const returningBadge = document.getElementById('returningBadge');
const slideTypeBadge = document.getElementById('slideTypeBadge');
const slideCounterText = document.getElementById('slideCounterText');
const sessionDetailsText = document.getElementById('sessionDetailsText');
const progressBar = document.getElementById('progressBar');
const upNextPill = document.getElementById('upNextPill');
const upNextText = document.getElementById('upNextText');
const celebrationBanner = document.getElementById('celebrationBanner');
const celebrationTitle = document.getElementById('celebrationTitle');
const celebrationSubtitle = document.getElementById('celebrationSubtitle');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const audioToggleBtn = document.getElementById('audioToggleBtn');

let progressInterval = null;
let soundEnabled = false;
let audioCtx = null;

// Audio Chime using Web Audio API (No external sound files required)
function playArrivalChime() {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    
    // Pleasant dual chime
    const now = audioCtx.currentTime;
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880.00, now + 0.15); // A5

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.65);
  } catch (err) {
    console.warn('Audio chime error:', err);
  }
}

// Sound toggle button
audioToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  audioToggleBtn.textContent = soundEnabled ? '🔔 Sound: On' : '🔔 Sound: Off';
  audioToggleBtn.style.color = soundEnabled ? '#34d399' : 'white';
  if (soundEnabled && !audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
});

// Fullscreen toggle
fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.warn('Fullscreen request failed:', err);
    });
  } else {
    document.exitFullscreen();
  }
});

// Load Standby QR Code
async function loadStandbyQR() {
  try {
    const res = await fetch('/api/slideshow/qr');
    const data = await res.json();
    if (data.success && data.qrDataUrl) {
      qrCodeImg.src = data.qrDataUrl;
      qrUrlText.textContent = data.url;
    }
  } catch (err) {
    console.warn('Could not load QR code:', err);
  }
}

// Animate progress bar across slide duration
function startProgressBar(durationSeconds) {
  if (progressInterval) {
    clearInterval(progressInterval);
  }

  progressBar.style.width = '0%';
  const startTime = Date.now();
  const totalMs = durationSeconds * 1000;

  progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const pct = Math.min(100, (elapsed / totalMs) * 100);
    progressBar.style.width = `${pct}%`;

    if (pct >= 100) {
      clearInterval(progressInterval);
    }
  }, 50);
}

// Render slide update
function displaySlide(slide) {
  if (!slide) return;

  if (slide.isStandby) {
    slideImage.style.display = 'none';
    bottomOverlay.style.display = 'none';
    backgroundBlur.style.backgroundImage = 'none';
    standbyCard.style.display = 'block';
    loadStandbyQR();
    return;
  }

  // Active photo slide
  standbyCard.style.display = 'none';

  // Smooth crossfade image
  slideImage.classList.remove('visible');
  setTimeout(() => {
    slideImage.src = slide.url;
    slideImage.style.display = 'block';
    backgroundBlur.style.backgroundImage = `url("${slide.url}")`;

    slideImage.onload = () => {
      slideImage.classList.add('visible');
    };
  }, 200);

  // Update Visitor Metadata
  bottomOverlay.style.display = 'flex';
  visitorNameText.textContent = slide.visitorName || 'Event Guest';

  // Returning visitor badge
  if (slide.isReturning) {
    returningBadge.style.display = 'inline-block';
    returningBadge.textContent = slide.visitCount ? `⭐ Visit #${slide.visitCount}` : '⭐ Returning Visitor';
  } else {
    returningBadge.style.display = 'none';
  }

  // Slide type pill (Past Memory vs New Photo vs Ambient Reel)
  if (slide.isAmbient) {
    slideTypeBadge.textContent = 'Event Reel';
    slideTypeBadge.style.background = 'rgba(59, 130, 246, 0.2)';
    slideTypeBadge.style.color = '#93c5fd';
    slideCounterText.textContent = 'Featured Photo';
    sessionDetailsText.textContent = 'From recent uploads';
  } else if (slide.isPast) {
    slideTypeBadge.textContent = '🕒 Past Memory';
    slideTypeBadge.style.background = 'rgba(245, 158, 11, 0.2)';
    slideTypeBadge.style.color = '#fde68a';
    slideCounterText.textContent = `Photo ${slide.slideNumber} of ${slide.totalSlides}`;
    sessionDetailsText.textContent = 'From a previous visit';
  } else {
    slideTypeBadge.textContent = '✨ New Photo';
    slideTypeBadge.style.background = 'rgba(16, 185, 129, 0.2)';
    slideTypeBadge.style.color = '#a7f3d0';
    slideCounterText.textContent = `Photo ${slide.slideNumber} of ${slide.totalSlides}`;
    sessionDetailsText.textContent = 'Uploaded today';
  }

  // Progress Bar
  const duration = slide.duration || 6;
  startProgressBar(duration);
}

// Socket event: Slide change
socket.on('slideshow:slide-change', (slide) => {
  displaySlide(slide);
});

// Socket event: Visitor arrival celebration banner
socket.on('slideshow:visitor-arrived', (data) => {
  celebrationTitle.textContent = data.isReturning
    ? `Welcome Back, ${data.visitorName}! ⭐`
    : `Welcome, ${data.visitorName}! 📸`;

  if (data.isReturning && data.pastPhotoCount > 0) {
    celebrationSubtitle.textContent = `Playing ${data.pastPhotoCount} past photo(s) + ${data.newPhotoCount} new photo(s)`;
  } else {
    celebrationSubtitle.textContent = `Playing ${data.newPhotoCount} new photo(s)`;
  }

  celebrationBanner.style.display = 'block';
  playArrivalChime();

  setTimeout(() => {
    celebrationBanner.style.display = 'none';
  }, 2800);
});

// Socket event: Queue status & Up Next pill
socket.on('slideshow:queue-update', (summary) => {
  if (summary.upNext && summary.upNext.length > 0) {
    const nextItem = summary.upNext[0];
    const moreCount = summary.upNext.length - 1;
    upNextText.textContent = moreCount > 0
      ? `${nextItem.visitorName} (${nextItem.slideCount} photos) +${moreCount} more`
      : `${nextItem.visitorName} (${nextItem.slideCount} photos)`;
    upNextPill.style.display = 'inline-flex';
  } else {
    upNextPill.style.display = 'none';
  }
});

// Initial load check
socket.on('connect', () => {
  socket.emit('slideshow:request-state');
});

socket.on('slideshow:state', (state) => {
  if (state.currentSlide) {
    displaySlide(state.currentSlide);
  } else {
    displaySlide({ isStandby: true });
  }

  if (state.upNext && state.upNext.length > 0) {
    const nextItem = state.upNext[0];
    upNextText.textContent = `${nextItem.visitorName} (${nextItem.slideCount} photos)`;
    upNextPill.style.display = 'inline-flex';
  }
});
