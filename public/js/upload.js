// Client-side controller for Visitor Photo Upload & Privacy Management

let selectedFiles = [];
let debounceTimer = null;
let currentVisitorData = null;
let lastGeneratedPass = null;

// DOM Elements
const uploadForm = document.getElementById('uploadForm');
const visitorNameInput = document.getElementById('visitorName');
const visitorIdentifierInput = document.getElementById('visitorIdentifier');
const returningBanner = document.getElementById('returningBanner');
const bannerTitle = document.getElementById('bannerTitle');
const bannerDesc = document.getElementById('bannerDesc');
const pastPhotosPreview = document.getElementById('pastPhotosPreview');
const includePastPhotosCheckbox = document.getElementById('includePastPhotosCheckbox');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const previewGrid = document.getElementById('previewGrid');
const consentCheckbox = document.getElementById('consentCheckbox');
const userPinInput = document.getElementById('userPin');
const submitBtn = document.getElementById('submitBtn');
const successCard = document.getElementById('successCard');
const successTitle = document.getElementById('successTitle');
const successMessage = document.getElementById('successMessage');
const displayPin = document.getElementById('displayPin');
const uploadMoreBtn = document.getElementById('uploadMoreBtn');
const toast = document.getElementById('toast');

// Tabs
const tabUploadBtn = document.getElementById('tabUploadBtn');
const tabManageBtn = document.getElementById('tabManageBtn');
const uploadSection = document.getElementById('uploadSection');
const manageSection = document.getElementById('manageSection');

// Tab toggling
tabUploadBtn.addEventListener('click', () => {
  tabUploadBtn.classList.add('active');
  tabManageBtn.classList.remove('active');
  uploadSection.style.display = 'block';
  manageSection.style.display = 'none';
});

tabManageBtn.addEventListener('click', () => {
  tabManageBtn.classList.add('active');
  tabUploadBtn.classList.remove('active');
  uploadSection.style.display = 'none';
  manageSection.style.display = 'block';
});

// Toast helper
function showToast(message, isError = false) {
  toast.textContent = message;
  toast.style.display = 'block';
  toast.style.borderLeftColor = isError ? '#ef4444' : '#10b981';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 4000);
}

// Check for returning visitor with debounce
function triggerVisitorLookup() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const name = visitorNameInput.value.trim();
    const identifier = visitorIdentifierInput.value.trim();

    if (name.length < 2 || identifier.length < 3) {
      returningBanner.style.display = 'none';
      currentVisitorData = null;
      return;
    }

    try {
      const res = await fetch('/api/visitors/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, identifier }),
      });
      const data = await res.json();

      if (data.success && data.isReturning && data.visitor) {
        currentVisitorData = data;
        const pastCount = data.pastPhotos ? data.pastPhotos.length : 0;
        bannerTitle.textContent = `Welcome Back, ${data.visitor.name}! (Visit #${(data.visitor.visitCount || 1) + 1})`;
        bannerDesc.textContent = `We found ${pastCount} photo(s) from your previous visit(s). They will play on the smart TV alongside your new photos!`;

        // Render past photos preview
        pastPhotosPreview.innerHTML = '';
        if (data.pastPhotos && data.pastPhotos.length > 0) {
          data.pastPhotos.slice(0, 5).forEach((photo) => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `<img src="/uploads/${photo.filename}" alt="Past photo" title="Uploaded on ${new Date(photo.created_at).toLocaleDateString()}">`;
            pastPhotosPreview.appendChild(div);
          });
        }

        returningBanner.style.display = 'flex';
      } else {
        returningBanner.style.display = 'none';
        currentVisitorData = null;
      }
    } catch (err) {
      console.warn('Visitor lookup error:', err);
    }
  }, 400);
}

visitorNameInput.addEventListener('input', triggerVisitorLookup);
visitorIdentifierInput.addEventListener('input', triggerVisitorLookup);

// Dropzone & File Handling
dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    handleFilesSelected(e.dataTransfer.files);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleFilesSelected(e.target.files);
  }
});

function handleFilesSelected(newFiles) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSizeBytes = 10 * 1024 * 1024; // 10MB

  for (let i = 0; i < newFiles.length; i++) {
    const file = newFiles[i];

    if (!allowedTypes.includes(file.type.toLowerCase())) {
      showToast(`Unsupported format: "${file.name}". Please upload JPG, PNG, or WEBP.`, true);
      continue;
    }

    if (file.size > maxSizeBytes) {
      showToast(`File too large: "${file.name}" exceeds 10MB limit.`, true);
      continue;
    }

    if (selectedFiles.length >= 5) {
      showToast('Maximum 5 photos allowed per submission.', true);
      break;
    }

    selectedFiles.push(file);
  }

  renderPreviews();
}

const photoCountBadge = document.getElementById('photoCountBadge');

function renderPreviews() {
  previewGrid.innerHTML = '';
  if (photoCountBadge) {
    if (selectedFiles.length > 0) {
      photoCountBadge.style.display = 'inline-block';
      photoCountBadge.textContent = `📸 ${selectedFiles.length} of 5 selected`;
    } else {
      photoCountBadge.style.display = 'none';
    }
  }

  selectedFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'preview-item';

    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    item.appendChild(img);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'preview-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.type = 'button';
    removeBtn.title = 'Remove photo';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFiles.splice(index, 1);
      renderPreviews();
    });
    item.appendChild(removeBtn);

    previewGrid.appendChild(item);
  });
}

// Form Submit Handler
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = visitorNameInput.value.trim();
  const identifier = visitorIdentifierInput.value.trim();
  const consent = consentCheckbox.checked;

  if (!name) {
    showToast('Please enter your name.', true);
    return;
  }

  if (!consent) {
    showToast('Please agree to the public display consent checkbox.', true);
    return;
  }

  if (selectedFiles.length === 0) {
    showToast('Please select at least one photo to upload.', true);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Uploading & Processing...';

  try {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('identifier', identifier);
    formData.append('consentGiven', 'true');
    formData.append('includePastPhotos', includePastPhotosCheckbox ? includePastPhotosCheckbox.checked.toString() : 'true');

    const pin = userPinInput.value.trim();
    if (pin) {
      formData.append('userPin', pin);
    }

    selectedFiles.forEach((file) => {
      formData.append('photos', file);
    });

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Upload failed.');
    }

    // Success transition
    uploadForm.style.display = 'none';
    returningBanner.style.display = 'none';
    successCard.style.display = 'block';
    successCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    successTitle.textContent = data.visitor.isReturning
      ? `Welcome Back, ${data.visitor.name}! 🚀`
      : `Welcome, ${data.visitor.name}! 🚀`;
    successMessage.textContent = data.message;
    displayPin.textContent = data.visitor.pin;

    // Load and render Digital Event Pass
    try {
      const passRes = await fetch(`/api/visitors/${data.visitor.id}/pass`);
      const passData = await passRes.json();
      if (passData.success && passData.pass) {
        lastGeneratedPass = passData.pass;
        try {
          localStorage.setItem('savedVisitorPass', JSON.stringify(passData.pass));
          updateAutoFillBtnState();
        } catch (e) {}

        const digitalPassCard = document.getElementById('digitalPassCard');
        const passVisitorName = document.getElementById('passVisitorName');
        const passQrImg = document.getElementById('passQrImg');
        if (digitalPassCard && passQrImg) {
          passVisitorName.textContent = passData.pass.name + (passData.pass.visitCount > 1 ? ` (Visit #${passData.pass.visitCount})` : '');
          passQrImg.src = passData.pass.qrDataUrl;
          digitalPassCard.style.display = 'block';
        }
      }
    } catch (passErr) {
      console.warn('Digital pass error:', passErr);
    }

    showToast('Photos uploaded successfully! Playing on the smart TV.');
  } catch (err) {
    showToast(err.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '🚀 Upload & Play on TV';
  }
});

// Upload More button handler
uploadMoreBtn.addEventListener('click', () => {
  selectedFiles = [];
  renderPreviews();
  fileInput.value = '';
  successCard.style.display = 'none';
  uploadForm.style.display = 'block';
  consentCheckbox.checked = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Withdraw Consent & Delete Photos Handler
const withdrawForm = document.getElementById('withdrawForm');
const withdrawResult = document.getElementById('withdrawResult');
const withdrawBtn = document.getElementById('withdrawBtn');

withdrawForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('withdrawName').value.trim();
  const identifier = document.getElementById('withdrawIdentifier').value.trim();
  const pin = document.getElementById('withdrawPin').value.trim();

  withdrawBtn.disabled = true;
  withdrawBtn.textContent = 'Processing withdrawal...';

  try {
    // 1. Identify visitor
    const idRes = await fetch('/api/visitors/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, identifier }),
    });
    const idData = await idRes.json();

    if (!idData.success || !idData.visitor) {
      throw new Error('No visitor found matching this Name and Identifier.');
    }

    // 2. Request withdrawal
    const purgeRes = await fetch('/api/visitors/withdraw-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: idData.visitor.id, pin }),
    });
    const purgeData = await purgeRes.json();

    if (!purgeRes.ok || !purgeData.success) {
      throw new Error(purgeData.error || 'Failed to purge photos.');
    }

    withdrawResult.style.display = 'block';
    withdrawResult.innerHTML = `
      <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 1rem; border-radius: var(--radius-md); color: #34d399;">
        <strong>✅ Consent Revoked:</strong> All photos for ${name} have been immediately removed from the live TV display and database.
      </div>
    `;
    withdrawForm.reset();
  } catch (err) {
    withdrawResult.style.display = 'block';
    withdrawResult.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); padding: 1rem; border-radius: var(--radius-md); color: #f87171;">
        <strong>❌ Error:</strong> ${err.message}
      </div>
    `;
  } finally {
    withdrawBtn.disabled = false;
    withdrawBtn.textContent = '🗑️ Delete All My Photos & Revoke Consent';
  }
});

// Live Reaction Bar Handler
const reactionButtons = document.querySelectorAll('.reaction-btn');
reactionButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    const emoji = btn.getAttribute('data-emoji');
    btn.style.transform = 'scale(1.35)';
    setTimeout(() => { btn.style.transform = ''; }, 180);

    try {
      await fetch('/api/slideshow/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      showToast(`Sent ${emoji} to the big screen!`);
    } catch (err) {
      console.warn('Reaction error:', err);
    }
  });
});

// Digital Event Pass: Copy Check-in Link & 1-Click Auto-fill
const copyPassLinkBtn = document.getElementById('copyPassLinkBtn');
const copyPassLinkToast = document.getElementById('copyPassLinkToast');
const enterPassCodeBtn = document.getElementById('enterPassCodeBtn');

if (copyPassLinkBtn) {
  copyPassLinkBtn.addEventListener('click', async () => {
    if (!lastGeneratedPass) return;
    const url = `${window.location.origin}/?name=${encodeURIComponent(lastGeneratedPass.name)}&identifier=${encodeURIComponent(lastGeneratedPass.identifier)}&pin=${encodeURIComponent(lastGeneratedPass.pin || '')}`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const temp = document.createElement('textarea');
        temp.value = url;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }

      if (copyPassLinkToast) {
        copyPassLinkToast.style.display = 'block';
        setTimeout(() => { copyPassLinkToast.style.display = 'none'; }, 3200);
      }
      showToast('📋 Check-in link copied! You can bookmark or text it to yourself.');
    } catch (e) {
      showToast('Could not copy automatically. You can scan your QR code!', true);
    }
  });
}

const clearPassBtn = document.getElementById('clearPassBtn');

function updateAutoFillBtnState() {
  if (!enterPassCodeBtn) return;
  try {
    const raw = localStorage.getItem('savedVisitorPass');
    if (raw) {
      const pass = JSON.parse(raw);
      if (pass && pass.name) {
        const firstName = pass.name.trim().split(' ')[0];
        enterPassCodeBtn.innerHTML = `⚡ Fill ${firstName}`;
        enterPassCodeBtn.style.background = 'rgba(59, 130, 246, 0.2)';
        enterPassCodeBtn.style.color = '#93c5fd';
        enterPassCodeBtn.title = `1-Click Fill as ${pass.name}`;
        if (clearPassBtn) clearPassBtn.style.display = 'inline-block';
        return;
      }
    }
  } catch (e) {}

  enterPassCodeBtn.innerHTML = '1-Click Auto-fill';
  enterPassCodeBtn.style.background = '';
  enterPassCodeBtn.style.color = '';
  enterPassCodeBtn.title = '';
  if (clearPassBtn) clearPassBtn.style.display = 'none';
}

if (clearPassBtn) {
  clearPassBtn.addEventListener('click', () => {
    try {
      localStorage.removeItem('savedVisitorPass');
    } catch (e) {}
    updateAutoFillBtnState();
    visitorNameInput.value = '';
    visitorIdentifierInput.value = '';
    userPinInput.value = '';
    showToast('Cleared saved pass. You can enter new details.');
  });
}

function applyPassDetails(name, identifier, pin) {
  if (name) visitorNameInput.value = name;
  if (identifier) visitorIdentifierInput.value = identifier;
  if (pin) userPinInput.value = pin;
  consentCheckbox.checked = true;
  triggerVisitorLookup();
}

if (enterPassCodeBtn) {
  enterPassCodeBtn.addEventListener('click', () => {
    let savedPass = null;
    try {
      const raw = localStorage.getItem('savedVisitorPass');
      if (raw) savedPass = JSON.parse(raw);
    } catch (e) {}

    if (savedPass && savedPass.name) {
      applyPassDetails(savedPass.name, savedPass.identifier, savedPass.pin);
      showToast(`✨ Auto-filled pass for ${savedPass.name}!`);
      return;
    }

    const input = window.prompt('Paste your Digital Pass Check-in link or Pass Code:');
    if (!input || !input.trim()) return;

    const trimmed = input.trim();
    // Case 1: JSON payload from QR code
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const data = JSON.parse(trimmed);
        applyPassDetails(data.name, data.identifier, data.pin);
        localStorage.setItem('savedVisitorPass', JSON.stringify(data));
        updateAutoFillBtnState();
        showToast(`✨ Auto-filled pass for ${data.name}!`);
        return;
      } catch (e) {}
    }

    // Case 2: URL with query parameters
    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `http://localhost/${trimmed}`);
      const name = url.searchParams.get('name');
      const identifier = url.searchParams.get('identifier');
      const pin = url.searchParams.get('pin');
      if (name || identifier) {
        applyPassDetails(name, identifier, pin);
        localStorage.setItem('savedVisitorPass', JSON.stringify({ name, identifier, pin }));
        updateAutoFillBtnState();
        showToast(`✨ Auto-filled pass for ${name || 'visitor'}!`);
        return;
      }
    } catch (e) {}

    // Case 3: Pipe or comma-separated: Name, Identifier, PIN
    const parts = trimmed.split(/[,|]/);
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const identifier = parts[1].trim();
      const pin = parts[2] ? parts[2].trim() : '';
      applyPassDetails(name, identifier, pin);
      localStorage.setItem('savedVisitorPass', JSON.stringify({ name, identifier, pin }));
      updateAutoFillBtnState();
      showToast(`✨ Auto-filled pass for ${name}!`);
      return;
    }

    showToast('Could not recognize pass format. Please enter details manually.', true);
  });
}

// Quick jump to Manage Photos with PIN from Success Card
const quickManagePhotosBtn = document.getElementById('quickManagePhotosBtn');
if (quickManagePhotosBtn) {
  quickManagePhotosBtn.addEventListener('click', () => {
    let pass = null;
    try {
      const raw = localStorage.getItem('savedVisitorPass');
      if (raw) pass = JSON.parse(raw);
    } catch (e) {}

    const name = (pass && pass.name) || visitorNameInput.value.trim();
    const identifier = (pass && pass.identifier) || visitorIdentifierInput.value.trim();
    const pin = (pass && pass.pin) || (displayPin ? displayPin.textContent.trim() : '');

    const withdrawName = document.getElementById('withdrawName');
    const withdrawIdentifier = document.getElementById('withdrawIdentifier');
    const withdrawPin = document.getElementById('withdrawPin');

    if (withdrawName && name) withdrawName.value = name;
    if (withdrawIdentifier && identifier) withdrawIdentifier.value = identifier;
    if (withdrawPin && pin) withdrawPin.value = pin;

    if (tabManageBtn) tabManageBtn.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Switched to photo management. Your PIN has been auto-filled.');
  });
}

// Auto-fill from URL parameters on page load (e.g. from bookmark or QR camera scan)
window.addEventListener('DOMContentLoaded', () => {
  updateAutoFillBtnState();
  try {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name');
    const identifier = params.get('identifier');
    const pin = params.get('pin');

    if (name || identifier) {
      applyPassDetails(name, identifier, pin);
      if (name && identifier) {
        localStorage.setItem('savedVisitorPass', JSON.stringify({ name, identifier, pin }));
        updateAutoFillBtnState();
      }
      showToast(`✨ Welcome! Auto-filled pass details for ${name || 'you'}.`);
    }
  } catch (e) {}
});

