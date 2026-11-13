# Test Plan & Verification Results

This document outlines both the automated test suites and the comprehensive manual test plan for the **Visitor Photo Slideshow** application.

---

## 1. Automated Test Suites

The project uses [Jest](https://jestjs.io/) and [Supertest](https://github.com/ladjs/supertest) for unit and integration testing across core business logic and HTTP endpoints.

### Running Automated Tests
```bash
# Execute full test suite
npm test
```

### Automated Test Coverage Summary

| Test File | Focus Area | Tests Executed | Status |
| :--- | :--- | :---: | :---: |
| `tests/visitor.test.js` | Visitor identity resolution, PIN generation, returning visits, consent purge | 6 | ✅ PASS |
| `tests/upload.test.js` | Multer validation, file type checks, consent requirements, returning visitor photo stitching | 5 | ✅ PASS |
| `tests/queue.test.js` | Display queue state machine, concurrent upload FIFO ordering, starvation prevention, photo moderation | 5 | ✅ PASS |
| **Total** | **All Critical Modules** | **16** | **100% PASS** |

---

## 2. Documented Manual Test Plan & Results

The following test scenarios were executed manually to verify end-to-end user flows, real-time smart TV synchronization, and edge cases.

### Test Case 1: First-Time Visitor Registration and Immediate TV Playback
* **Objective:** Verify that a first-time visitor's uploaded photo immediately triggers slideshow playback on the TV screen.
* **Pre-conditions:** Smart TV screen opened at `http://localhost:3000/tv.html` in standby/ambient mode.
* **Test Steps:**
  1. Open visitor upload portal at `http://localhost:3000/`.
  2. Enter Name: `"Alice Walker"`, Email/Phone: `"alice@walker.com"`.
  3. Attach 2 JPEG photos (each < 10MB).
  4. Check the mandatory display consent box.
  5. Click **"Upload & Play on TV"**.
* **Expected Result:**
  - Visitor receives immediate confirmation showing their 4-digit deletion PIN.
  - Smart TV immediately receives WebSocket event `slideshow:visitor-arrived`.
  - Celebration banner appears: *"Welcome, Alice Walker! Playing 2 new photo(s)"*.
  - TV screen displays Photo 1 with Ken Burns zoom, visitor name card, slide counter (1 of 2), and timer progress bar.
* **Actual Result:** **PASS** (Zero latency display; WebSocket event delivered instantly).

---

### Test Case 2: Returning Visitor Identification and Past Photo Stitching
* **Objective:** Verify that when a returning visitor uploads new photos, the application identifies them and plays their past photos alongside the new photos.
* **Pre-conditions:** Test Case 1 completed (Alice Walker already has 2 photos in the system).
* **Test Steps:**
  1. Open visitor upload portal at `http://localhost:3000/`.
  2. Enter Name: `"Alice Walker"` and Identifier: `"alice@walker.com"`.
  3. Observe dynamic visitor identification lookup.
  4. Notice the *"Welcome Back, Alice Walker! (Visit #2)"* banner with past photo previews.
  5. Attach 1 new photo.
  6. Click **"Upload & Play on TV"**.
* **Expected Result:**
  - System recognizes Alice as a returning visitor.
  - Slideshow batch compiles 2 past photos + 1 new photo = 3 total slides.
  - TV screen displays the returning visitor badge: `⭐ Visit #2`.
  - Slide indicators show `🕒 Past Memory` for previous photos and `✨ New Photo` for the newly uploaded photo.
* **Actual Result:** **PASS** (Past photos played first, followed by new photo).

---

### Test Case 3: Concurrent Multi-User Uploads (Race Condition & Queueing)
* **Objective:** Verify that when several people upload at once, the system doesn't crash, drop photos, or overwrite displays.
* **Test Steps:**
  1. Open 3 browser tabs with the upload form.
  2. Tab 1: Submit photos for *"Bob Smith"*.
  3. Tab 2: Simultaneously submit photos for *"Charlie Davis"*.
  4. Tab 3: Simultaneously submit photos for *"Diana Evans"*.
* **Expected Result:**
  - Node.js async I/O processes all 3 multipart requests concurrently.
  - Bob Smith's batch starts playing immediately.
  - Charlie Davis and Diana Evans are placed in the FIFO `pendingQueue`.
  - Smart TV displays the floating queue pill in the top-right corner: *"Up Next: Charlie Davis (1 photo) +1 more"*.
  - When Bob's slides complete, Charlie's slides automatically take over without TV refresh.
* **Actual Result:** **PASS** (FIFO order preserved; queue counter updated in real time via Socket.IO).

---

### Test Case 4: File Validation and Upload Limits
* **Objective:** Ensure invalid file types and excessive file sizes are rejected gracefully.
* **Test Steps:**
  1. Attempt to upload a `.txt` or `.exe` file renamed to `.jpg`.
  2. Attempt to upload a photo exceeding 10MB.
  3. Attempt to upload more than 5 photos at once.
  4. Attempt to submit the form without checking the consent box.
* **Expected Result:**
  - Client-side validation blocks invalid files with informative toast notifications.
  - Server-side Multer middleware rejects invalid payloads with HTTP 400 and clear error descriptions.
* **Actual Result:** **PASS** (Both client-side and server-side validation rejected bad files).

---

### Test Case 5: Real-Time Content Moderation & Takedown
* **Objective:** Ensure event administrators can immediately remove inappropriate photos from the live TV screen.
* **Test Steps:**
  1. Open Admin console at `http://localhost:3000/admin.html` with key `admin123`.
  2. Observe uploaded photos grid.
  3. Click **"🚫 Hide Photo"** on a photo currently playing on the TV.
* **Expected Result:**
  - Photo is marked `is_active = 0` in SQLite.
  - Socket.IO emits `slideshow:photo-removed`.
  - TV screen immediately crossfades away from the removed photo to the next slide.
  - Action is permanently logged in the Privacy Audit Trail.
* **Actual Result:** **PASS** (Screen transitioned to next slide in < 200ms).

---

### Test Case 6: Visitor "Right to be Forgotten" (Self-Service Data Removal)
* **Objective:** Verify a visitor can withdraw consent and delete their photos using their personal 4-digit PIN.
* **Test Steps:**
  1. Open `http://localhost:3000/` and click the **"🛡️ Privacy & Delete Photos"** tab.
  2. Enter Name, Identifier, and PIN given during upload.
  3. Click **"Delete All My Photos & Revoke Consent"**.
* **Expected Result:**
  - All visitor photos are deactivated.
  - If any photo was in the active slideshow queue, it is immediately purged.
  - Audit log records `CONSENT_WITHDRAWN_PURGE`.
* **Actual Result:** **PASS** (All photos removed; subsequent identify calls return zero past photos).
