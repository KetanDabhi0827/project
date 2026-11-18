// Admin & Moderation Controller

let adminKey = localStorage.getItem('slideshow_admin_key') || 'admin123';
const socket = io();

// DOM Elements
const authPanel = document.getElementById('authPanel');
const dashboardSection = document.getElementById('dashboardSection');
const adminKeyInput = document.getElementById('adminKeyInput');
const authBtn = document.getElementById('authBtn');

const prevBtn = document.getElementById('prevBtn');
const skipBtn = document.getElementById('skipBtn');
const pauseToggleBtn = document.getElementById('pauseToggleBtn');
const clearQueueBtn = document.getElementById('clearQueueBtn');
const durationSlider = document.getElementById('durationSlider');
const durationDisplay = document.getElementById('durationDisplay');

const liveSlideVisitor = document.getElementById('liveSlideVisitor');
const liveSlideMeta = document.getElementById('liveSlideMeta');
const queueCountDisplay = document.getElementById('queueCountDisplay');

const photosGrid = document.getElementById('photosGrid');
const refreshPhotosBtn = document.getElementById('refreshPhotosBtn');
const visitorsTableBody = document.getElementById('visitorsTableBody');
const auditLogsBody = document.getElementById('auditLogsBody');

let isPaused = false;

// Authentication Helper
async function verifyAdminKey(key) {
  try {
    const res = await fetch('/api/admin/visitors', {
      headers: { 'x-admin-key': key },
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

async function initAdmin() {
  const isValid = await verifyAdminKey(adminKey);
  if (isValid) {
    authPanel.style.display = 'none';
    dashboardSection.style.display = 'block';
    loadAllAdminData();
  } else {
    authPanel.style.display = 'block';
    dashboardSection.style.display = 'none';
  }
}

authBtn.addEventListener('click', async () => {
  const key = adminKeyInput.value.trim();
  const isValid = await verifyAdminKey(key);
  if (isValid) {
    adminKey = key;
    localStorage.setItem('slideshow_admin_key', key);
    authPanel.style.display = 'none';
    dashboardSection.style.display = 'block';
    loadAllAdminData();
  } else {
    alert('Invalid Admin API key. Please check your .env configuration.');
  }
});

// Load all admin data
async function loadAllAdminData() {
  loadBrandingSettings();
  loadPhotos();
  loadVisitors();
  loadAuditLogs();
}

// 0. Branding & Settings
const brandingForm = document.getElementById('brandingForm');
const brandEventName = document.getElementById('brandEventName');
const brandEventTagline = document.getElementById('brandEventTagline');
const brandThemeColor = document.getElementById('brandThemeColor');
const brandTransition = document.getElementById('brandTransition');
const saveBrandingBtn = document.getElementById('saveBrandingBtn');

async function loadBrandingSettings() {
  try {
    const res = await fetch('/api/slideshow/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      if (brandEventName) brandEventName.value = data.settings.eventName || '';
      if (brandEventTagline) brandEventTagline.value = data.settings.eventTagline || '';
      if (brandThemeColor) brandThemeColor.value = data.settings.themeColor || 'blue';
      if (brandTransition) brandTransition.value = data.settings.transitionEffect || 'kenburns';
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
        alert('✅ Event branding and themes updated live across all screens!');
      } else {
        alert(data.error || 'Failed to update branding.');
      }
    } catch (err) {
      alert('Error updating branding: ' + err.message);
    } finally {
      saveBrandingBtn.disabled = false;
      saveBrandingBtn.textContent = '💾 Save & Apply Branding';
    }
  });
}

// 1. Photos
async function loadPhotos() {
  try {
    const res = await fetch('/api/admin/photos', {
      headers: { 'x-admin-key': adminKey },
    });
    const data = await res.json();
    if (!data.success) return;

    photosGrid.innerHTML = '';
    if (data.photos.length === 0) {
      photosGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1;">No photos uploaded yet.</p>';
      return;
    }

    data.photos.forEach((photo) => {
      const card = document.createElement('div');
      card.className = 'photo-card';

      const isActive = photo.is_active === 1;
      const statusBadge = isActive
        ? '<span class="badge-status badge-active">Active on Display</span>'
        : '<span class="badge-status badge-hidden">Hidden / Moderated</span>';

      const actionBtn = isActive
        ? `<button class="btn btn-danger btn-sm" onclick="moderatePhoto('${photo.id}')">🚫 Hide Photo</button>`
        : `<span style="color: var(--text-muted); font-size: 0.8rem;">Removed from display</span>`;

      card.innerHTML = `
        <img src="${photo.url}" alt="${photo.original_name}">
        <div class="photo-meta">
          <div>
            ${statusBadge}
            <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 0.25rem;">${photo.visitor_name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem;">
              ${new Date(photo.created_at).toLocaleString()}
            </div>
          </div>
          <div>${actionBtn}</div>
        </div>
      `;

      photosGrid.appendChild(card);
    });
  } catch (err) {
    console.warn('Error loading photos:', err);
  }
}

// Moderate / Hide Photo
window.moderatePhoto = async function (photoId) {
  if (!confirm('Are you sure you want to hide this photo from the live slideshow?')) return;

  try {
    const res = await fetch('/api/admin/moderate-photo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
      },
      body: JSON.stringify({ photoId, reason: 'Flagged by Admin' }),
    });
    const data = await res.json();
    if (data.success) {
      loadPhotos();
    } else {
      alert(data.error || 'Failed to moderate photo.');
    }
  } catch (err) {
    alert('Error connecting to server.');
  }
};

refreshPhotosBtn.addEventListener('click', loadPhotos);

// 2. Visitors Table
async function loadVisitors() {
  try {
    const res = await fetch('/api/admin/visitors', {
      headers: { 'x-admin-key': adminKey },
    });
    const data = await res.json();
    if (!data.success) return;

    visitorsTableBody.innerHTML = '';
    if (data.visitors.length === 0) {
      visitorsTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No visitors registered yet.</td></tr>';
      return;
    }

    data.visitors.forEach((v) => {
      const row = document.createElement('tr');
      const isConsent = v.consent_given === 1;
      row.innerHTML = `
        <td><strong>${v.name}</strong></td>
        <td><code>${v.identifier}</code></td>
        <td><span style="font-weight: 700; color: #60a5fa;">${v.visit_count} visit(s)</span></td>
        <td>${isConsent ? '<span style="color: #34d399;">✅ Consented</span>' : '<span style="color: #f87171;">❌ Revoked</span>'}</td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(v.first_visited_at).toLocaleString()}</td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(v.last_visited_at).toLocaleString()}</td>
      `;
      visitorsTableBody.appendChild(row);
    });
  } catch (err) {
    console.warn('Error loading visitors:', err);
  }
}

// 3. Privacy Audit Logs
async function loadAuditLogs() {
  try {
    const res = await fetch('/api/admin/audit-logs', {
      headers: { 'x-admin-key': adminKey },
    });
    const data = await res.json();
    if (!data.success) return;

    auditLogsBody.innerHTML = '';
    if (data.logs.length === 0) {
      auditLogsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No audit events logged yet.</td></tr>';
      return;
    }

    data.logs.forEach((log) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(log.timestamp).toLocaleString()}</td>
        <td><code>${log.action}</code></td>
        <td style="font-size: 0.8rem;">${log.visitor_id ? log.visitor_id.substring(0, 8) + '...' : 'System'}</td>
        <td style="font-size: 0.85rem;">${log.details || ''}</td>
      `;
      auditLogsBody.appendChild(row);
    });
  } catch (err) {
    console.warn('Error loading audit logs:', err);
  }
}

// 4. Playback Controls
prevBtn.addEventListener('click', async () => {
  await fetch('/api/admin/prev', {
    method: 'POST',
    headers: { 'x-admin-key': adminKey },
  });
});

skipBtn.addEventListener('click', async () => {
  await fetch('/api/admin/skip', {
    method: 'POST',
    headers: { 'x-admin-key': adminKey },
  });
});

pauseToggleBtn.addEventListener('click', async () => {
  const endpoint = isPaused ? '/api/admin/resume' : '/api/admin/pause';
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'x-admin-key': adminKey },
  });
});

clearQueueBtn.addEventListener('click', async () => {
  if (!confirm('Clear all pending visitor batches in the queue?')) return;
  await fetch('/api/admin/clear-queue', {
    method: 'POST',
    headers: { 'x-admin-key': adminKey },
  });
});

durationSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  durationDisplay.textContent = `${val}s`;
});

durationSlider.addEventListener('change', async (e) => {
  const seconds = parseInt(e.target.value, 10);
  await fetch('/api/admin/duration', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
    },
    body: JSON.stringify({ seconds }),
  });
});

// Socket synchronization
socket.on('slideshow:slide-change', (slide) => {
  if (slide.isStandby) {
    liveSlideVisitor.textContent = 'Standby Screen';
    liveSlideMeta.textContent = 'Waiting for visitors to upload';
  } else {
    liveSlideVisitor.textContent = slide.visitorName;
    liveSlideMeta.textContent = slide.isPast
      ? `Past photo (${slide.slideNumber}/${slide.totalSlides})`
      : `New photo (${slide.slideNumber}/${slide.totalSlides})`;
  }
});

socket.on('slideshow:queue-update', (summary) => {
  queueCountDisplay.textContent = summary.pendingCount || 0;
  if (summary.slideDuration) {
    durationSlider.value = summary.slideDuration;
    durationDisplay.textContent = `${summary.slideDuration}s`;
  }
});

socket.on('slideshow:status-update', (status) => {
  isPaused = status.isPaused;
  pauseToggleBtn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
});

initAdmin();
