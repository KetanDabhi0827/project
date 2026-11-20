// Admin & Event Command Center Controller

let adminKey = '';
const socket = io();

// Cache
let allPhotosCache = [];
let allVisitorsCache = [];
let currentPhotoFilter = 'all';
let isPaused = false;
let currentSlideDuration = 6;

// DOM Elements - Auth
const authPanel = document.getElementById('authPanel');
const dashboardSection = document.getElementById('dashboardSection');
const authForm = document.getElementById('authForm');
const adminKeyInput = document.getElementById('adminKeyInput');
const togglePasswordVisibilityBtn = document.getElementById('togglePasswordVisibilityBtn');
const authBtn = document.getElementById('authBtn');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
const socketStatusDot = document.getElementById('socketStatusDot');
const adminToast = document.getElementById('adminToast');

// DOM Elements - Change Admin Pass Key
const changePassKeyForm = document.getElementById('changePassKeyForm');
const newAdminKeyInput = document.getElementById('newAdminKeyInput');
const toggleNewKeyVisibilityBtn = document.getElementById('toggleNewKeyVisibilityBtn');
const savePassKeyBtn = document.getElementById('savePassKeyBtn');

// DOM Elements - KPIs
const kpiTotalPhotos = document.getElementById('kpiTotalPhotos');
const kpiActivePhotos = document.getElementById('kpiActivePhotos');
const kpiTotalVisitors = document.getElementById('kpiTotalVisitors');
const kpiReturningVisitors = document.getElementById('kpiReturningVisitors');
const kpiQueueCount = document.getElementById('kpiQueueCount');
const kpiSlideDuration = document.getElementById('kpiSlideDuration');
const kpiThemeName = document.getElementById('kpiThemeName');
const kpiTransitionName = document.getElementById('kpiTransitionName');

// DOM Elements - Live Monitor & Controls
const liveSlideThumb = document.getElementById('liveSlideThumb');
const liveSlideVisitor = document.getElementById('liveSlideVisitor');
const liveSlideMeta = document.getElementById('liveSlideMeta');
const liveStatusBadge = document.getElementById('liveStatusBadge');
const liveSpeedBadge = document.getElementById('liveSpeedBadge');
const refreshStatsBtn = document.getElementById('refreshStatsBtn');

const prevBtn = document.getElementById('prevBtn');
const pauseToggleBtn = document.getElementById('pauseToggleBtn');
const skipBtn = document.getElementById('skipBtn');
const clearQueueBtn = document.getElementById('clearQueueBtn');
const durationSlider = document.getElementById('durationSlider');
const durationDisplay = document.getElementById('durationDisplay');

// DOM Elements - Announcement
const announcementForm = document.getElementById('announcementForm');
const announcementTitleInput = document.getElementById('announcementTitleInput');
const announcementIconSelect = document.getElementById('announcementIconSelect');
const announcementMessageInput = document.getElementById('announcementMessageInput');
const announcementDurationSelect = document.getElementById('announcementDurationSelect');
const broadcastBtn = document.getElementById('broadcastBtn');

// DOM Elements - Branding
const brandingForm = document.getElementById('brandingForm');
const brandEventName = document.getElementById('brandEventName');
const brandEventTagline = document.getElementById('brandEventTagline');
const brandThemeColor = document.getElementById('brandThemeColor');
const brandTransition = document.getElementById('brandTransition');
const saveBrandingBtn = document.getElementById('saveBrandingBtn');

// DOM Elements - Photos Moderation
const photosGrid = document.getElementById('photosGrid');
const refreshPhotosBtn = document.getElementById('refreshPhotosBtn');
const photoSearchInput = document.getElementById('photoSearchInput');
const filterChips = document.querySelectorAll('.filter-chip');
const countFilterAll = document.getElementById('countFilterAll');
const countFilterActive = document.getElementById('countFilterActive');
const countFilterHidden = document.getElementById('countFilterHidden');

// DOM Elements - Visitors & Logs
const visitorSearchInput = document.getElementById('visitorSearchInput');
const exportVisitorsBtn = document.getElementById('exportVisitorsBtn');
const visitorsTableBody = document.getElementById('visitorsTableBody');
const auditLogsBody = document.getElementById('auditLogsBody');

// DOM Elements - Modal
const photoModal = document.getElementById('photoModal');
const modalPhotoImg = document.getElementById('modalPhotoImg');
const modalPhotoTitle = document.getElementById('modalPhotoTitle');
const modalPhotoMeta = document.getElementById('modalPhotoMeta');
const modalActions = document.getElementById('modalActions');
const closeModalBtn = document.getElementById('closeModalBtn');

// Toast Notification Helper
function showToast(message, isError = false) {
  if (!adminToast) return;
  adminToast.textContent = message;
  adminToast.style.borderLeftColor = isError ? '#ef4444' : '#10b981';
  adminToast.style.display = 'block';
  setTimeout(() => {
    adminToast.style.display = 'none';
  }, 3500);
}

// Authentication Verification
async function verifyAdminKey(key) {
  if (!key) return 'invalid_key';
  try {
    const res = await fetch('/api/admin/stats', {
      headers: { 'x-admin-key': key },
    });
    if (res.ok) return 'ok';
    if (res.status === 401 || res.status === 403) return 'invalid_key';
    return 'server_error';
  } catch (err) {
    return 'network_error';
  }
}

function initAdmin() {
  adminKey = '';
  try {
    localStorage.removeItem('slideshow_admin_key');
    sessionStorage.removeItem('slideshow_admin_key');
  } catch (e) {}

  if (authPanel) authPanel.style.display = 'block';
  if (dashboardSection) dashboardSection.style.display = 'none';
  if (adminLogoutBtn) adminLogoutBtn.style.display = 'none';
  if (adminKeyInput) {
    adminKeyInput.value = '';
    setTimeout(() => {
      if (adminKeyInput) adminKeyInput.focus();
    }, 150);
  }
}

async function handleLogin(e) {
  if (e) e.preventDefault();
  const key = (adminKeyInput ? adminKeyInput.value : '').trim();
  if (!key) {
    showToast('Please enter the Admin Pass Key.', true);
    return;
  }

  if (authBtn) {
    authBtn.disabled = true;
    authBtn.textContent = 'Verifying...';
  }

  const status = await verifyAdminKey(key);

  if (authBtn) {
    authBtn.disabled = false;
    authBtn.textContent = 'Unlock Command Center';
  }

  if (status === 'ok') {
    adminKey = key;
    authPanel.style.display = 'none';
    dashboardSection.style.display = 'block';
    if (adminLogoutBtn) adminLogoutBtn.style.display = 'inline-block';
    loadAllAdminData();
    showToast('Admin Command Center unlocked successfully!');
  } else if (status === 'invalid_key') {
    if (/^\d{4}$/.test(key)) {
      showToast('⚠️ That is a 4-digit Visitor PIN! Admin Master Key is required (default: admin123). To delete photos with your PIN, visit the Photo Upload Page.', true);
    } else {
      showToast('Invalid Admin Pass Key. Default master key is admin123', true);
    }
  } else if (status === 'network_error') {
    showToast('Unable to connect to server. Is the Node server running?', true);
  } else {
    showToast('Server returned an error. Check server logs.', true);
  }
}

if (authForm) {
  authForm.addEventListener('submit', handleLogin);
} else if (authBtn) {
  authBtn.addEventListener('click', handleLogin);
}

if (togglePasswordVisibilityBtn && adminKeyInput) {
  togglePasswordVisibilityBtn.addEventListener('click', () => {
    const isPassword = adminKeyInput.type === 'password';
    adminKeyInput.type = isPassword ? 'text' : 'password';
    togglePasswordVisibilityBtn.textContent = isPassword ? '🙈' : '👁️';
  });
}

if (adminLogoutBtn) {
  adminLogoutBtn.addEventListener('click', () => {
    localStorage.removeItem('slideshow_admin_key');
    authPanel.style.display = 'block';
    dashboardSection.style.display = 'none';
    adminLogoutBtn.style.display = 'none';
    if (adminKeyInput) {
      adminKeyInput.value = '';
      adminKeyInput.focus();
    }
    showToast('Admin locked out.');
  });
}

// Change Admin Pass Key Handler
if (toggleNewKeyVisibilityBtn && newAdminKeyInput) {
  toggleNewKeyVisibilityBtn.addEventListener('click', () => {
    const isPassword = newAdminKeyInput.type === 'password';
    newAdminKeyInput.type = isPassword ? 'text' : 'password';
    toggleNewKeyVisibilityBtn.textContent = isPassword ? '🙈' : '👁️';
  });
}

if (changePassKeyForm) {
  changePassKeyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newKey = (newAdminKeyInput ? newAdminKeyInput.value : '').trim();
    if (!newKey || newKey.length < 4) {
      showToast('Pass key must be at least 4 characters long.', true);
      return;
    }
    if (savePassKeyBtn) {
      savePassKeyBtn.disabled = true;
      savePassKeyBtn.textContent = 'Saving...';
    }
    try {
      const res = await fetch('/api/admin/change-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ newAdminKey: newKey }),
      });
      const data = await res.json();
      if (data.success) {
        adminKey = newKey;
        if (adminKeyInput) adminKeyInput.value = newKey;
        if (newAdminKeyInput) newAdminKeyInput.value = '';
        showToast('✅ Admin Pass Key updated successfully! Use this new key next time.');
      } else {
        showToast(data.error || 'Failed to update pass key.', true);
      }
    } catch (err) {
      showToast('Network error while updating pass key.', true);
    } finally {
      if (savePassKeyBtn) {
        savePassKeyBtn.disabled = false;
        savePassKeyBtn.textContent = 'Update Pass Key';
      }
    }
  });
}

// Load All Admin Data
async function loadAllAdminData() {
  await Promise.all([
    loadStats(),
    loadBrandingSettings(),
    loadPhotos(),
    loadVisitors(),
    loadAuditLogs(),
  ]);
}

if (refreshStatsBtn) {
  refreshStatsBtn.addEventListener('click', () => {
    loadStats();
    showToast('Synchronized live display metrics.');
  });
}

// 1. Load KPI Stats & Live Status
async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats', {
      headers: { 'x-admin-key': adminKey },
    });
    const data = await res.json();
    if (!data.success || !data.stats) return;

    const stats = data.stats;
    if (kpiTotalPhotos) kpiTotalPhotos.textContent = stats.totalPhotos;
    if (kpiActivePhotos) kpiActivePhotos.textContent = stats.activePhotos;
    if (kpiTotalVisitors) kpiTotalVisitors.textContent = stats.totalVisitors;
    if (kpiReturningVisitors) kpiReturningVisitors.textContent = stats.returningVisitors;
    if (kpiQueueCount) kpiQueueCount.textContent = stats.pendingBatches;
    if (kpiSlideDuration) kpiSlideDuration.textContent = `${stats.slideDuration}s`;

    currentSlideDuration = stats.slideDuration;
    if (durationSlider) durationSlider.value = stats.slideDuration;
    if (durationDisplay) durationDisplay.textContent = `${stats.slideDuration}s`;

    isPaused = stats.isPaused;
    updatePauseButton();

    if (stats.currentSlide) {
      updateLiveMonitor(stats.currentSlide);
    }
  } catch (err) {
    console.warn('Error loading stats:', err);
  }
}

// Update Live TV Monitor Thumbnail & Details
function updateLiveMonitor(slide) {
  if (!slide || slide.isStandby) {
    liveSlideVisitor.textContent = 'Standby Screen';
    liveSlideMeta.textContent = 'Waiting for visitors to upload photos';
    liveSlideThumb.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" fill="%230f172a"><rect width="100%" height="100%"/><text x="50%" y="45%" fill="%2360a5fa" text-anchor="middle" font-size="20">📸</text><text x="50%" y="70%" fill="%2394a3b8" text-anchor="middle" font-size="11">Standby Screen</text></svg>';
    liveStatusBadge.textContent = 'Standby Reel';
    liveStatusBadge.className = 'badge-status';
    liveStatusBadge.style.background = 'rgba(148, 163, 184, 0.2)';
    liveStatusBadge.style.color = '#94a3b8';
  } else {
    liveSlideVisitor.textContent = slide.visitorName;
    liveSlideMeta.textContent = slide.isPast
      ? `Past Photo (${slide.slideNumber}/${slide.totalSlides}) • ${slide.dateLabel || 'Previous Visit'}`
      : `New Photo (${slide.slideNumber}/${slide.totalSlides}) • Uploaded Today`;
    if (slide.url) {
      liveSlideThumb.src = slide.url;
    }
    liveStatusBadge.textContent = isPaused ? 'Paused' : 'Live on Screen';
    liveStatusBadge.className = `badge-status ${isPaused ? 'badge-hidden' : 'badge-active'}`;
  }
  if (liveSpeedBadge) {
    liveSpeedBadge.textContent = `⏱️ ${currentSlideDuration}s per slide`;
  }
}

function updatePauseButton() {
  if (!pauseToggleBtn) return;
  pauseToggleBtn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
  if (liveStatusBadge) {
    liveStatusBadge.textContent = isPaused ? 'Paused' : 'Live on Screen';
    liveStatusBadge.className = `badge-status ${isPaused ? 'badge-hidden' : 'badge-active'}`;
  }
}

// 2. Playback Deck Handlers
prevBtn.addEventListener('click', async () => {
  await fetch('/api/admin/prev', {
    method: 'POST',
    headers: { 'x-admin-key': adminKey },
  });
  showToast('Stepped to previous slide.');
});

skipBtn.addEventListener('click', async () => {
  await fetch('/api/admin/skip', {
    method: 'POST',
    headers: { 'x-admin-key': adminKey },
  });
  showToast('Skipped to next slide.');
});

pauseToggleBtn.addEventListener('click', async () => {
  const endpoint = isPaused ? '/api/admin/resume' : '/api/admin/pause';
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'x-admin-key': adminKey },
  });
  isPaused = !isPaused;
  updatePauseButton();
  showToast(isPaused ? '⏸️ Slideshow paused.' : '▶️ Slideshow resumed.');
});

clearQueueBtn.addEventListener('click', async () => {
  if (!confirm('Clear all pending visitor batches waiting in the queue?')) return;
  await fetch('/api/admin/clear-queue', {
    method: 'POST',
    headers: { 'x-admin-key': adminKey },
  });
  loadStats();
  showToast('Pending display queue cleared.');
});

durationSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  durationDisplay.textContent = `${val}s`;
});

durationSlider.addEventListener('change', async (e) => {
  const seconds = parseInt(e.target.value, 10);
  currentSlideDuration = seconds;
  if (kpiSlideDuration) kpiSlideDuration.textContent = `${seconds}s`;
  await fetch('/api/admin/duration', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
    },
    body: JSON.stringify({ seconds }),
  });
  showToast(`Slide duration updated to ${seconds}s.`);
});

// Moderator Cheering Emojis
const adminReactButtons = document.querySelectorAll('.admin-react-btn');
adminReactButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    const emoji = btn.getAttribute('data-emoji');
    btn.style.transform = 'scale(1.3)';
    setTimeout(() => { btn.style.transform = ''; }, 180);

    try {
      await fetch('/api/slideshow/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      showToast(`Sent ${emoji} to the big screen!`);
    } catch (e) {}
  });
});

// 3. Live Announcement Broadcaster Form
if (announcementForm) {
  announcementForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = announcementTitleInput.value.trim();
    const icon = announcementIconSelect.value;
    const message = announcementMessageInput.value.trim();
    const durationSeconds = parseInt(announcementDurationSelect.value, 10) || 10;

    if (!message) {
      showToast('Please enter an announcement message.', true);
      return;
    }

    broadcastBtn.disabled = true;
    broadcastBtn.textContent = 'Broadcasting...';

    try {
      const res = await fetch('/api/admin/broadcast-announcement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ title, icon, message, durationSeconds }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('📢 Announcement broadcasted live across all Smart TVs!');
        announcementMessageInput.value = '';
      } else {
        showToast(data.error || 'Failed to broadcast announcement.', true);
      }
    } catch (err) {
      showToast('Error broadcasting announcement: ' + err.message, true);
    } finally {
      broadcastBtn.disabled = false;
      broadcastBtn.textContent = '🚀 Broadcast to TV';
    }
  });
}

// 4. Branding & Visual Theme Studio
async function loadBrandingSettings() {
  try {
    const res = await fetch('/api/slideshow/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      if (brandEventName) brandEventName.value = data.settings.eventName || '';
      if (brandEventTagline) brandEventTagline.value = data.settings.eventTagline || '';
      if (brandThemeColor) brandThemeColor.value = data.settings.themeColor || 'blue';
      if (brandTransition) brandTransition.value = data.settings.transitionEffect || 'kenburns';

      if (kpiThemeName) kpiThemeName.textContent = data.settings.themeColor || 'Ocean Blue';
      if (kpiTransitionName) kpiTransitionName.textContent = data.settings.transitionEffect || 'Ken Burns';
    }
  } catch (err) {
    console.warn('Could not load branding settings:', err);
  }
}

if (brandingForm) {
  brandingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBrandingBtn.disabled = true;
    saveBrandingBtn.textContent = 'Saving...';

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({
          eventName: brandEventName.value,
          eventTagline: brandEventTagline.value,
          themeColor: brandThemeColor.value,
          transitionEffect: brandTransition.value,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (kpiThemeName) kpiThemeName.textContent = brandThemeColor.value;
        if (kpiTransitionName) kpiTransitionName.textContent = brandTransition.value;
        showToast('🎨 Branding & Visual Theme applied live across all TV screens!');
      } else {
        showToast(data.error || 'Failed to update branding.', true);
      }
    } catch (err) {
      showToast('Error updating branding: ' + err.message, true);
    } finally {
      saveBrandingBtn.disabled = false;
      saveBrandingBtn.textContent = '💾 Save & Apply Live';
    }
  });
}

// 5. Photos Moderation Grid with Filter & Search
async function loadPhotos() {
  try {
    const res = await fetch('/api/admin/photos', {
      headers: { 'x-admin-key': adminKey },
    });
    const data = await res.json();
    if (!data.success) return;

    allPhotosCache = data.photos || [];
    renderFilteredPhotos();
  } catch (err) {
    console.warn('Error loading photos:', err);
  }
}

function renderFilteredPhotos() {
  const searchTerm = (photoSearchInput ? photoSearchInput.value : '').toLowerCase().trim();

  // Update counts
  const totalCount = allPhotosCache.length;
  const activeCount = allPhotosCache.filter((p) => p.is_active === 1).length;
  const hiddenCount = allPhotosCache.filter((p) => p.is_active === 0).length;

  if (countFilterAll) countFilterAll.textContent = totalCount;
  if (countFilterActive) countFilterActive.textContent = activeCount;
  if (countFilterHidden) countFilterHidden.textContent = hiddenCount;

  // Filter
  const filtered = allPhotosCache.filter((photo) => {
    // Status filter
    if (currentPhotoFilter === 'active' && photo.is_active !== 1) return false;
    if (currentPhotoFilter === 'hidden' && photo.is_active !== 0) return false;

    // Search filter
    if (searchTerm) {
      const matchName = (photo.visitor_name || '').toLowerCase().includes(searchTerm);
      const matchFile = (photo.original_name || '').toLowerCase().includes(searchTerm);
      if (!matchName && !matchFile) return false;
    }
    return true;
  });

  photosGrid.innerHTML = '';
  if (filtered.length === 0) {
    photosGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem; color: var(--text-muted); background: rgba(0,0,0,0.2); border-radius: 8px;">
        🔍 No photos match the selected criteria.
      </div>`;
    return;
  }

  filtered.forEach((photo) => {
    const card = document.createElement('div');
    card.className = 'photo-card';

    const isActive = photo.is_active === 1;
    const statusBadge = isActive
      ? '<span class="badge-status badge-active">Active on Display</span>'
      : '<span class="badge-status badge-hidden">Hidden / Moderated</span>';

    const actionBtn = isActive
      ? `<button class="btn btn-danger btn-sm" onclick="moderatePhoto('${photo.id}')" style="width: 100%;">🚫 Hide from TV</button>`
      : `<button class="btn btn-secondary btn-sm" onclick="unmoderatePhoto('${photo.id}')" style="width: 100%; border-color: rgba(52, 211, 153, 0.4); color: #34d399;">♻️ Restore to TV</button>`;

    card.innerHTML = `
      <img src="${photo.url}" alt="${photo.original_name}" onclick="openPhotoModal('${photo.id}')" title="Click to inspect full photo">
      <div class="photo-meta">
        <div>
          ${statusBadge}
          <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 0.2rem; color: #ffffff;">${photo.visitor_name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.4rem;">
            ${new Date(photo.created_at).toLocaleString()}
          </div>
          <div style="font-size: 0.72rem; color: #34d399; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.25rem;">
            <span>🤖</span> <span>AI Safety Verified • Smart TV Fit</span>
          </div>
        </div>
        <div>${actionBtn}</div>
      </div>
    `;

    photosGrid.appendChild(card);
  });
}

// Filter Chips handler
filterChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    filterChips.forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    currentPhotoFilter = chip.getAttribute('data-filter');
    renderFilteredPhotos();
  });
});

if (photoSearchInput) {
  photoSearchInput.addEventListener('input', renderFilteredPhotos);
}

if (refreshPhotosBtn) {
  refreshPhotosBtn.addEventListener('click', () => {
    loadPhotos();
    showToast('Photo grid refreshed.');
  });
}

// Moderate (Hide) Photo
window.moderatePhoto = async function (photoId) {
  if (!confirm('Are you sure you want to hide this photo from the live Smart TV slideshow?')) return;

  try {
    const res = await fetch('/api/admin/moderate-photo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
      },
      body: JSON.stringify({ photoId, reason: 'Flagged by Moderator' }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('🚫 Photo hidden from display.');
      closePhotoModal();
      loadPhotos();
      loadStats();
    } else {
      showToast(data.error || 'Failed to moderate photo.', true);
    }
  } catch (err) {
    showToast('Error connecting to server.', true);
  }
};

// Unmoderate (Restore) Photo
window.unmoderatePhoto = async function (photoId) {
  try {
    const res = await fetch('/api/admin/unmoderate-photo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
      },
      body: JSON.stringify({ photoId }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('♻️ Photo restored to active display.');
      closePhotoModal();
      loadPhotos();
      loadStats();
    } else {
      showToast(data.error || 'Failed to restore photo.', true);
    }
  } catch (err) {
    showToast('Error connecting to server.', true);
  }
};

// Full Photo Inspection Modal
window.openPhotoModal = function (photoId) {
  const photo = allPhotosCache.find((p) => p.id === photoId);
  if (!photo) return;

  modalPhotoImg.src = photo.url;
  modalPhotoTitle.textContent = `${photo.visitor_name}'s Photo`;
  modalPhotoMeta.innerHTML = `
    <div><strong>Original Filename:</strong> ${photo.original_name || photo.filename}</div>
    <div><strong>Uploaded:</strong> ${new Date(photo.created_at).toLocaleString()}</div>
    <div><strong>Dimensions / Type:</strong> ${photo.mime_type} • ${(photo.file_size / 1024).toFixed(1)} KB</div>
    <div><strong>Status:</strong> ${photo.is_active === 1 ? '<span style="color:#34d399">Active on Smart TV</span>' : '<span style="color:#f87171">Hidden</span>'}</div>
  `;

  modalActions.innerHTML = photo.is_active === 1
    ? `<button class="btn btn-danger btn-sm" onclick="moderatePhoto('${photo.id}')">🚫 Hide from TV</button>`
    : `<button class="btn btn-secondary btn-sm" onclick="unmoderatePhoto('${photo.id}')" style="border-color: rgba(52, 211, 153, 0.4); color: #34d399;">♻️ Restore to TV</button>`;

  photoModal.style.display = 'flex';
};

function closePhotoModal() {
  if (photoModal) photoModal.style.display = 'none';
}

if (closeModalBtn) closeModalBtn.addEventListener('click', closePhotoModal);
if (photoModal) {
  photoModal.addEventListener('click', (e) => {
    if (e.target === photoModal) closePhotoModal();
  });
}

// 6. Registered Visitors Directory with Search & Export
async function loadVisitors() {
  try {
    const res = await fetch('/api/admin/visitors', {
      headers: { 'x-admin-key': adminKey },
    });
    const data = await res.json();
    if (!data.success) return;

    allVisitorsCache = data.visitors || [];
    renderFilteredVisitors();
  } catch (err) {
    console.warn('Error loading visitors:', err);
  }
}

function renderFilteredVisitors() {
  const query = (visitorSearchInput ? visitorSearchInput.value : '').toLowerCase().trim();

  const filtered = allVisitorsCache.filter((v) => {
    if (!query) return true;
    const matchName = (v.name || '').toLowerCase().includes(query);
    const matchId = (v.identifier || '').toLowerCase().includes(query);
    return matchName || matchId;
  });

  visitorsTableBody.innerHTML = '';
  if (filtered.length === 0) {
    visitorsTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No visitors match your search.</td></tr>';
    return;
  }

  filtered.forEach((v) => {
    const row = document.createElement('tr');
    const isConsent = v.consent_given === 1;
    const pinBadge = v.pin
      ? `<span style="font-family: monospace; font-size: 0.88rem; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); padding: 0.15rem 0.5rem; border-radius: 4px; color: #93c5fd; letter-spacing: 1px;">${v.pin}</span>`
      : '<span style="color: var(--text-muted); font-size: 0.75rem;">None</span>';

    row.innerHTML = `
      <td><strong>${v.name}</strong></td>
      <td><code>${v.identifier}</code></td>
      <td>${pinBadge}</td>
      <td><span style="font-weight: 700; color: #60a5fa;">${v.visit_count} visit(s)</span></td>
      <td>${isConsent ? '<span style="color: #34d399; font-weight: 600;">✅ Consented</span>' : '<span style="color: #f87171; font-weight: 600;">❌ Revoked</span>'}</td>
      <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(v.first_visited_at).toLocaleString()}</td>
      <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(v.last_visited_at).toLocaleString()}</td>
    `;
    visitorsTableBody.appendChild(row);
  });
}

if (visitorSearchInput) {
  visitorSearchInput.addEventListener('input', renderFilteredVisitors);
}

// Export Visitors CSV
if (exportVisitorsBtn) {
  exportVisitorsBtn.addEventListener('click', () => {
    window.location.href = `/api/admin/export-visitors?adminKey=${encodeURIComponent(adminKey)}`;
    showToast('📥 Downloading visitors directory CSV...');
  });
}

// 7. Privacy Audit Logs
async function loadAuditLogs() {
  try {
    const res = await fetch('/api/admin/audit-logs', {
      headers: { 'x-admin-key': adminKey },
    });
    const data = await res.json();
    if (!data.success) return;

    auditLogsBody.innerHTML = '';
    if (data.logs.length === 0) {
      auditLogsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No audit events logged yet.</td></tr>';
      return;
    }

    data.logs.forEach((log) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="font-size: 0.78rem; color: var(--text-muted); white-space: nowrap;">${new Date(log.timestamp).toLocaleString()}</td>
        <td><code>${log.action}</code></td>
        <td style="font-size: 0.78rem;">${log.visitor_id ? log.visitor_id.substring(0, 8) + '...' : 'System'}</td>
        <td style="font-size: 0.82rem;">${log.details || ''}</td>
      `;
      auditLogsBody.appendChild(row);
    });
  } catch (err) {
    console.warn('Error loading audit logs:', err);
  }
}

// 8. Real-time Socket.IO synchronization
socket.on('connect', () => {
  if (socketStatusDot) {
    socketStatusDot.innerHTML = '<span style="width: 7px; height: 7px; background: #34d399; border-radius: 50%;"></span> Relay Connected';
    socketStatusDot.style.color = '#34d399';
  }
});

socket.on('disconnect', () => {
  if (socketStatusDot) {
    socketStatusDot.innerHTML = '<span style="width: 7px; height: 7px; background: #f87171; border-radius: 50%;"></span> Relay Disconnected';
    socketStatusDot.style.color = '#f87171';
  }
});

socket.on('slideshow:slide-change', (slide) => {
  updateLiveMonitor(slide);
});

socket.on('slideshow:queue-update', (summary) => {
  if (kpiQueueCount) kpiQueueCount.textContent = summary.pendingCount || 0;
  if (summary.slideDuration) {
    currentSlideDuration = summary.slideDuration;
    if (kpiSlideDuration) kpiSlideDuration.textContent = `${summary.slideDuration}s`;
    if (durationSlider) durationSlider.value = summary.slideDuration;
    if (durationDisplay) durationDisplay.textContent = `${summary.slideDuration}s`;
    if (liveSpeedBadge) liveSpeedBadge.textContent = `⏱️ ${summary.slideDuration}s per slide`;
  }
});

socket.on('slideshow:status-update', (status) => {
  isPaused = status.isPaused;
  updatePauseButton();
});

socket.on('slideshow:visitor-arrived', () => {
  loadStats();
  loadPhotos();
  loadVisitors();
});

// Start initialization
initAdmin();