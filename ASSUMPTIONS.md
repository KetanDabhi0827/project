# ASSUMPTIONS.md: Design Decisions & Filled Gaps

This document records all assumptions made while interpreting the requirements for **Assignment 1: Visitor Photo Slideshow**, explaining the rationale and technical tradeoffs behind each choice.

---

## 1. Returning Visitor Identification

### The Ambiguity / Requirement Gap
The specification requires: *"Each visitor is asked for their name and photos... If the person is visiting again, the slideshow also plays their previous photos."*  
However, real-world events involve multiple guests sharing the same first name (e.g. "John", "Sarah"), and requiring full authentication (passwords, OAuth logins, biometric facial recognition) introduces excessive friction that discourages event attendees from participating.

### Our Solution & Assumptions
1. **Two-Factor Identifier (Name + Contact Handle):**  
   - We require **Full Name** + a secondary unique identifier (**Email address or Phone number**).
   - Names and identifiers are normalized: whitespace is collapsed, and text is lowercased (e.g., `"  Alice Walker  "` and `"alice walker"` match identically).
2. **Frictionless Real-Time Lookup:**  
   - As the visitor types their name and email/phone, the mobile upload interface asynchronously queries `/api/visitors/identify` with a 400ms debounce.
   - If recognized, a welcoming banner appears: *"Welcome back, Alice Walker! We found 2 past photo(s) from your previous visit."*
3. **Visitor Choice & Control:**  
   - We assume returning visitors may not want *every* historical photo shown again. We provide an explicit toggle: *"Include past photos in this slideshow session"* (enabled by default) and display preview thumbnails so the visitor has full situational awareness before uploading.
4. **Identity Protection via 4-Digit PIN:**  
   - Upon first submission, a lightweight 4-digit PIN is issued (or chosen by the visitor). This PIN acts as a lightweight management token to prevent malicious parties from impersonating a visitor to delete or manipulate their photos.

---

## 2. Privacy, Consent, and Public Display

### The Ambiguity / Requirement Gap
The specification notes: *"Privacy and consent, since photos of people are displayed publicly."*  
Smart TVs in public venues (lobbies, conferences, weddings) expose personal likenesses to crowds. Unregulated display risks non-consensual photography, harassment, or GDPR/CCPA compliance violations.

### Our Solution & Assumptions
1. **Mandatory Explicit Consent (Unchecked by Default):**  
   - Before uploading, visitors must affirmatively check:  
     > *"I confirm I have the right to share these photos and consent to them being displayed publicly on the venue smart TV screens. Photos expire automatically and can be removed at any time."*
   - Submissions without consent are rejected at both the frontend and backend API levels (HTTP 400).
2. **Right to be Forgotten (Self-Service Instant Takedown):**  
   - A dedicated **"🛡️ Privacy & Delete Photos"** tab allows any visitor to enter their Name, Identifier, and 4-digit PIN to immediately purge all their photos from the database and active slideshow queue without needing an administrator.
3. **Real-Time Admin Moderation:**  
   - An administrator dashboard (`/admin.html`) provides a live feed of all uploaded photos with a one-click **"🚫 Hide Photo"** button.
   - When clicked, a WebSocket event (`slideshow:photo-removed`) instructs connected TV screens to instantly crossfade away from the moderated image in under 200 milliseconds.
4. **Automated Ephemeral Retention (Time-To-Live):**  
   - Event photos are assumed to be temporary. Photos carry an `expires_at` timestamp (default: 24 hours, configurable via `RETENTION_HOURS`). A background task automatically sweeps and unlinks expired files from disk and database.
5. **Privacy Audit Logging:**  
   - Every grant of consent, consent revocation, or administrative takedown is appended to an immutable `consent_logs` table recording action, timestamp, and a one-way hashed IP address (`SHA-256(IP + salt)`) for compliance traceability without storing raw visitor IPs.

---

## 3. File Validation, Upload Limits, and Concurrent Uploads

### The Ambiguity / Requirement Gap
The specification requires: *"File validation, upload size limits, and what happens when several people upload at once."*

### Our Solution & Assumptions

#### A. File Validation & Size Limits
1. **Allowed MIME Types & Extensions:**  
   - Restricted strictly to image formats: `image/jpeg` (`.jpg`, `.jpeg`), `image/png` (`.png`), and `image/webp` (`.webp`).
   - Non-image files (e.g. `.pdf`, `.mp4`, `.exe`, `.svg` with executable script tags) are blocked by Multer's `fileFilter`.
2. **Size Constraints:**  
   - Maximum file size: **10 MB per image** (`MAX_FILE_SIZE_MB=10`).
   - Maximum files per submission: **5 photos per upload** (`MAX_FILES_PER_UPLOAD=5`).
   - Enforced both client-side (instant browser alert) and server-side (Multer `limits`).
3. **Safe Storage & Sanitization:**  
   - Original filenames (e.g., `../../../evil.jpg`) are discarded. Files are renamed using cryptographic UUIDs (`photo-${uuidv4()}.jpg`) to eliminate path traversal vulnerabilities and collision overwrites.

#### B. Concurrent Uploads & Queue Scheduling (What happens when several people upload at once?)
1. **Asynchronous I/O Processing:**  
   - Node.js's non-blocking event loop processes multiple incoming multipart streams concurrently. SQLite is configured with **Write-Ahead Logging (WAL)** mode (`PRAGMA journal_mode = WAL`), allowing concurrent readers and writers without database locking errors.
2. **FIFO Display Queue:**  
   - Upload batches enter an in-memory priority queue (`QueueService`).
   - If the TV display is idle (or in ambient standby), the first upload plays immediately.
   - If a slideshow is currently playing Visitor A's batch, subsequent batches from Visitor B and Visitor C are queued in strict First-In, First-Out order (`pendingQueue`).
3. **Smart TV "Up Next" Awareness:**  
   - Connected TV displays receive a `slideshow:queue-update` WebSocket notification. An animated overlay pill appears on screen: *"Up Next: Charlie (2 photos) +1 more"*, giving attendees instant visual feedback that their upload was received and scheduled.
4. **Starvation Prevention (Fair-Share Past Photo Capping):**  
   - If a returning visitor has attended 10 prior events and has 30 historical photos, playing all 30 photos would block the screen for 3+ minutes, starving new guests.
   - We assume a **fair-share cap of at most 5 recent past photos + all new photos** per playback session. This celebrates returning guests without causing screen congestion.

---

## 4. Slideshow Playback & Smart TV Display

### The Ambiguity / Requirement Gap
The specification requires: *"As soon as an upload completes, the photo plays in a slideshow for a specific duration on a smart TV or computer display."*

### Our Solution & Assumptions
1. **Display Duration:**  
   - Default slide duration is set to **6 seconds** (`SLIDESHOW_DURATION_SECONDS=6`).
   - Administrators can adjust the duration on-the-fly between 2 seconds and 30 seconds via the Admin Console slider, broadcast live to all screens via WebSockets.
2. **Ambient Mode vs. Active Mode:**  
   - **Active Mode:** When visitor uploads exist, photos play with animated visitor cards, slide counter (`Photo 1 of 3`), and a live timer progress bar.
   - **Ambient Mode:** When the queue empties, the screen seamlessly transitions to an ambient reel of past event photos or a high-contrast QR code standby screen inviting new guests to scan and upload.
3. **Celebration Announcement Card:**  
   - When a new visitor's batch begins, an animated banner pops up on screen for 2.8 seconds:  
     *"Welcome Back, Alex! (Visit #3) - Playing 2 past photos + 1 new photo"*.
   - If enabled on the TV, an audio chime (synthesized via the browser's Web Audio API, requiring zero audio downloads) rings to alert attendees in the room.
