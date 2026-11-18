// ==========================================================================
// Smart TV Slideshow Controller with Dual-Buffer Crossfade & Interactive Controls
// ==========================================================================

const socket = io();

// DOM Elements
const backgroundBlur = document.getElementById('backgroundBlur');
const slideImageA = document.getElementById('slideImageA');
const slideImageB = document.getElementById('slideImageB');
const standbyCard = document.getElementById('standbyCard');
const qrCodeImg = document.getElementById('qrCodeImg');
const qrUrlText = document.getElementById('qrUrlText');
const bottomOverlay = document.getElementById('bottomOverlay');
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

// Interactive Control Bar
const tvControlBar = document.getElementById('tvControlBar');
const tvPrevBtn = document.getElementById('tvPrevBtn');
const tvPlayPauseBtn = document.getElementById('tvPlayPauseBtn');
const tvNextBtn = document.getElementById('tvNextBtn');
const tvRefreshBtn = document.getElementById('tvRefreshBtn');
const speedChips = document.querySelectorAll('.tv-speed-chip');

// Runtime State
let activeBuffer = 'A'; // 'A' or 'B'
let currentSlide = null;
let progressInterval = null;
let failSafeTimer = null;
let isPaused = false;
let currentDuration = 6;
let soundEnabled = false;
let audioCtx = null;
let controlBarTimeout = null;

// Audio Chime using Web Audio API (Zero external network requests)
function playArrivalChime() {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';

    const now = audioCtx.currentTime;
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880.0, now + 0.15); // A5

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

// Sound toggle
audioToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  audioToggleBtn.textContent = soundEnabled ? '🔔 Sound: On' : '🔔 Sound: Off';
  audioToggleBtn.style.color = soundEnabled ? '#34d399' : 'white';
  if (soundEnabled && !audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
});

// Fullscreen toggle
fullscreenBtn.addEventListener('click', toggleFullscreen);

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.warn('Fullscreen request failed:', err);
    });
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// Load QR code for Standby Card
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

// Auto-advance progress bar
function startProgressBar(durationSeconds) {
  if (progressInterval) {
    clearInterval(progressInterval);
  }

  progressBar.style.width = '0%';
  const startTime = Date.now();
  const totalMs = durationSeconds * 1000;

  progressInterval = setInterval(() => {
    if (isPaused) return;

    const elapsed = Date.now() - startTime;
    const pct = Math.min(100, (elapsed / totalMs) * 100);
    progressBar.style.width = `${pct}%`;

    if (pct >= 100) {
      clearInterval(progressInterval);
    }
  }, 50);
}

// Dual-Buffer Crossfade Display Engine
function displaySlide(slide) {
  if (!slide) return;
  currentSlide = slide;
  currentDuration = slide.duration || currentDuration || 6;

  // Clear fail-safe timer on every incoming slide
  if (failSafeTimer) {
    clearTimeout(failSafeTimer);
    failSafeTimer = null;
  }

  // Handle Standby state (no photos)
  if (slide.isStandby) {
    slideImageA.classList.remove('active');
    slideImageB.classList.remove('active');
    bottomOverlay.style.display = 'none';
    backgroundBlur.style.backgroundImage = 'none';
    standbyCard.style.display = 'block';
    loadStandbyQR();
    scheduleFailSafe(5);
    return;
  }

  // Active Photo Slide
  standbyCard.style.display = 'none';

  // Determine incoming vs outgoing image buffer
  const incomingImg = activeBuffer === 'A' ? slideImageB : slideImageA;
  const outgoingImg = activeBuffer === 'A' ? slideImageA : slideImageB;

  // Set incoming image source
  const imageReady = () => {
    incomingImg.classList.add('active');
    outgoingImg.classList.remove('active');
    activeBuffer = activeBuffer === 'A' ? 'B' : 'A';
    backgroundBlur.style.backgroundImage = `url("${slide.url}")`;
  };

  incomingImg.onload = imageReady;
  incomingImg.src = slide.url;

  // If already cached by browser
  if (incomingImg.complete) {
    imageReady();
  }

  // Metadata Updates
  bottomOverlay.style.display = 'flex';
  visitorNameText.textContent = slide.visitorName || 'Event Guest';

  if (slide.isReturning) {
    returningBadge.style.display = 'inline-block';
    returningBadge.textContent = slide.visitCount ? `⭐ Visit #${slide.visitCount}` : '⭐ Returning Visitor';
  } else {
    returningBadge.style.display = 'none';
  }

  // Badge pills
  if (slide.isAmbient) {
    slideTypeBadge.textContent = 'Event Reel';
    slideTypeBadge.style.background = 'rgba(59, 130, 246, 0.25)';
    slideTypeBadge.style.color = '#93c5fd';
    slideCounterText.textContent = 'Featured Photo';
    sessionDetailsText.textContent = 'From recent uploads';
  } else if (slide.isPast) {
    slideTypeBadge.textContent = '🕒 Past Memory';
    slideTypeBadge.style.background = 'rgba(245, 158, 11, 0.25)';
    slideTypeBadge.style.color = '#fde68a';
    slideCounterText.textContent = `Photo ${slide.slideNumber} of ${slide.totalSlides}`;
    sessionDetailsText.textContent = slide.dateLabel || 'From a previous visit';
  } else {
    slideTypeBadge.textContent = '✨ New Photo';
    slideTypeBadge.style.background = 'rgba(16, 185, 129, 0.25)';
    slideTypeBadge.style.color = '#a7f3d0';
    slideCounterText.textContent = `Photo ${slide.slideNumber} of ${slide.totalSlides}`;
    sessionDetailsText.textContent = slide.dateLabel || 'Uploaded today';
  }

  // Start visual timer bar
  startProgressBar(currentDuration);

  // Set fail-safe auto-advance timer to guarantee slide changes even if socket hiccups
  scheduleFailSafe(currentDuration);
}

// Fail-safe auto-advance: client proactively advances if server is delayed
function scheduleFailSafe(seconds) {
  if (failSafeTimer) clearTimeout(failSafeTimer);
  if (isPaused) return;

  failSafeTimer = setTimeout(() => {
    if (!isPaused) {
      fetch('/api/slideshow/next', { method: 'POST' }).catch(() => {});
    }
  }, (seconds + 1.5) * 1000);
}

// Manual Navigation Actions
async function advanceSlide() {
  try {
    const res = await fetch('/api/slideshow/next', { method: 'POST' });
    const data = await res.json();
    if (data.success && data.currentSlide) {
      displaySlide(data.currentSlide);
    }
  } catch (err) {
    console.warn('Next slide error:', err);
  }
}

async function previousSlide() {
  try {
    const res = await fetch('/api/slideshow/prev', { method: 'POST' });
    const data = await res.json();
    if (data.success && data.currentSlide) {
      displaySlide(data.currentSlide);
    }
  } catch (err) {
    console.warn('Previous slide error:', err);
  }
}

async function togglePlayPause() {
  try {
    const res = await fetch('/api/slideshow/toggle-pause', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      isPaused = data.isPaused;
      updatePlayPauseButton();
    }
  } catch (err) {
    console.warn('Pause toggle error:', err);
  }
}

function updatePlayPauseButton() {
  tvPlayPauseBtn.textContent = isPaused ? '▶️' : '⏸';
  tvPlayPauseBtn.title = isPaused ? 'Resume Playback' : 'Pause Playback';
  if (isPaused) {
    if (failSafeTimer) clearTimeout(failSafeTimer);
  } else {
    scheduleFailSafe(currentDuration);
  }
}

// Speed selection chips
speedChips.forEach((chip) => {
  chip.addEventListener('click', async () => {
    const seconds = parseInt(chip.getAttribute('data-speed'), 10);
    speedChips.forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    currentDuration = seconds;

    try {
      await fetch('/api/slideshow/duration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds }),
      });
      startProgressBar(seconds);
      scheduleFailSafe(seconds);
    } catch (err) {
      console.warn('Speed change error:', err);
    }
  });
});

// Wire Control Bar Buttons
tvPrevBtn.addEventListener('click', previousSlide);
tvNextBtn.addEventListener('click', advanceSlide);
tvPlayPauseBtn.addEventListener('click', togglePlayPause);
tvRefreshBtn.addEventListener('click', () => {
  socket.emit('slideshow:request-state');
});

// Auto-hide Control Bar on idle
function resetControlBarTimer() {
  tvControlBar.classList.remove('autohide');
  clearTimeout(controlBarTimeout);
  controlBarTimeout = setTimeout(() => {
    tvControlBar.classList.add('autohide');
  }, 3500);
}

document.addEventListener('mousemove', resetControlBarTimer);
document.addEventListener('click', resetControlBarTimer);
resetControlBarTimer();

// Keyboard & TV Remote Shortcuts
document.addEventListener('keydown', (e) => {
  resetControlBarTimer();

  switch (e.key) {
    case 'ArrowRight':
    case ' ':
    case 'PageDown':
      e.preventDefault();
      advanceSlide();
      break;

    case 'ArrowLeft':
    case 'PageUp':
      e.preventDefault();
      previousSlide();
      break;

    case 'p':
    case 'P':
      e.preventDefault();
      togglePlayPause();
      break;

    case 'f':
    case 'F':
      e.preventDefault();
      toggleFullscreen();
      break;

    case 'm':
    case 'M':
      e.preventDefault();
      audioToggleBtn.click();
      break;
  }
});

// Socket.IO Events
socket.on('slideshow:slide-change', (slide) => {
  displaySlide(slide);
});

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

  if (summary.slideDuration) {
    currentDuration = summary.slideDuration;
    speedChips.forEach((chip) => {
      chip.classList.toggle('active', parseInt(chip.getAttribute('data-speed'), 10) === currentDuration);
    });
  }
});

socket.on('slideshow:status-update', (status) => {
  isPaused = status.isPaused;
  updatePlayPauseButton();
});

socket.on('slideshow:settings-update', (settings) => {
  if (settings.slideDuration) {
    currentDuration = settings.slideDuration;
    speedChips.forEach((chip) => {
      chip.classList.toggle('active', parseInt(chip.getAttribute('data-speed'), 10) === currentDuration);
    });
  }
});

// Initial Connection Sync
socket.on('connect', () => {
  socket.emit('slideshow:request-state');
});

socket.on('slideshow:state', (state) => {
  if (state.currentSlide) {
    displaySlide(state.currentSlide);
  } else {
    displaySlide({ isStandby: true });
  }

  if (state.isPaused !== undefined) {
    isPaused = state.isPaused;
    updatePlayPauseButton();
  }

  if (state.slideDuration) {
    currentDuration = state.slideDuration;
    speedChips.forEach((chip) => {
      chip.classList.toggle('active', parseInt(chip.getAttribute('data-speed'), 10) === currentDuration);
    });
  }
});

// Live Floating Emoji Reactions
const tvReactionsLayer = document.getElementById('tvReactionsLayer');

function triggerFloatingEmoji(emoji, xPos) {
  if (!tvReactionsLayer) return;
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = emoji;
  const safeX = xPos || (Math.floor(Math.random() * 75) + 12);
  el.style.left = `${safeX}%`;
  tvReactionsLayer.appendChild(el);

  // Subtle pop chime when reaction arrives (if sound enabled)
  if (soundEnabled && audioCtx) {
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      const now = audioCtx.currentTime;
      osc.frequency.setValueAtTime(450 + Math.random() * 250, now);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.exponentialRampToValueAtTime(0.1, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {}
  }

  setTimeout(() => {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }, 3300);
}

socket.on('slideshow:reaction', (data) => {
  if (data && data.emoji) {
    triggerFloatingEmoji(data.emoji, data.xPos);
  }
});

// Dynamic Branding & Customization Engine
const tvEventNameText = document.getElementById('tvEventNameText');

function applyBrandingSettings(settings) {
  if (!settings) return;
  if (settings.eventName && tvEventNameText) {
    tvEventNameText.textContent = settings.eventName;
  }
  if (settings.themeColor) {
    document.body.classList.remove('theme-blue', 'theme-purple', 'theme-emerald', 'theme-rose', 'theme-amber');
    document.body.classList.add(`theme-${settings.themeColor}`);
  }
  if (settings.transitionEffect) {
    document.body.classList.remove('transition-kenburns', 'transition-3d-flip', 'transition-zoom', 'transition-smooth-fade');
    document.body.classList.add(`transition-${settings.transitionEffect}`);
  }
}

async function loadInitialSettings() {
  try {
    const res = await fetch('/api/slideshow/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      applyBrandingSettings(data.settings);
    }
  } catch (err) {
    console.warn('Could not load settings:', err);
  }
}

loadInitialSettings();

socket.on('slideshow:branding-update', (branding) => {
  applyBrandingSettings(branding);
});
