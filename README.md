# 📸 Smart TV Visitor Photo Slideshow

> An event-ready, real-time photo slideshow system for Smart TVs and computer displays with automatic returning visitor recognition, fair-share queueing, and strict privacy consent controls.

---

## 🌟 Key Features

1. **📱 Frictionless Visitor Upload Portal (`/index.html`):**
   - Attendees scan a QR code on the TV screen using their smartphone camera.
   - Enter their Name and Phone Number / Email.
   - Attach up to 5 photos (JPEG, PNG, WEBP, up to 10MB each) with instant thumbnail previews.
   - Dynamic returning visitor detection recognizes previous guests in real time and offers to include past memories.

2. **📺 Real-Time Smart TV Display (`/tv.html`):**
   - Instant playback synchronization via **Socket.IO** (Zero page refresh required).
   - High-impact visual presentation: Ken Burns zoom/pan effect, animated blurred ambient background, slide countdown progress bar.
   - Celebratory arrival announcement banner when a new guest's batch appears on screen.
   - Returning visitor badging: Highlights visit count and distinguishes *"✨ New Photo"* from *"🕒 Past Memory"*.
   - Floating **"Up Next"** queue pill informs guests when their photos will appear.
   - Native Web Audio chime alert (toggleable on screen).
   - Ambient reel fallback and high-contrast standby QR code when no active uploads are in queue.

3. **⭐ Returning Visitor Intelligence:**
   - Identified via composite matching on normalized Name + Contact Identifier.
   - Previous visit photos are automatically retrieved and scheduled in the visitor's session.
   - **Fair-Share Starvation Capping:** Caps historical photos to the 5 most recent past photos per session, ensuring a single guest with 30 past photos doesn't monopolize the screen when multiple people are uploading.

4. **🛡️ Privacy & "Right to be Forgotten":**
   - **Mandatory Consent Checkbox:** Unchecked by default; required before uploading.
   - **Self-Service Photo Deletion:** Every visitor receives a personal 4-digit PIN to immediately purge all their photos from the server and live TV screen via the *"🛡️ Privacy & Delete Photos"* tab.
   - **Automated Retention Worker:** Ephemeral event photos automatically expire and are purged from disk after 24 hours (`RETENTION_HOURS=24`).
   - **Privacy Audit Trail:** Every consent grant, revocation, and moderation action is logged with a salted SHA-256 IP hash for compliance.

5. **⚙️ Admin & Moderation Console (`/admin.html`):**
   - Live slideshow controls: Skip current slide, Pause/Resume, Clear Queue.
   - Dynamic slide display duration slider (2s – 30s) broadcast live to all connected screens.
   - Instant photo moderation grid: Flag and hide any inappropriate image in $< 200\text{ms}$.
   - Complete directory of registered visitors, visit frequencies, and consent audit logs.

---

## 🛠️ Tech Stack

- **Runtime:** Node.js (v18+)
- **Backend Framework:** Express.js 5
- **Real-Time Communication:** Socket.IO
- **Database:** SQLite3 with Write-Ahead Logging (WAL mode)
- **Upload Engine:** Multer with file type & size verification
- **Frontend Clients:** Pure HTML5, Modern CSS3 (Glassmorphism & Ken Burns), ES6 JavaScript (Zero compilation/build overhead; works on any Smart TV browser)
- **Audio:** Browser Web Audio API (Zero external MP3 dependencies)
- **Testing:** Jest, Supertest

---

## 🚀 Setup & Run Instructions

### Prerequisites
- Node.js (version 18 or newer)
- npm

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd visitor-photo-slideshow
npm install
```

### 2. Configure Environment Variables
Copy the example configuration:
```bash
cp .env.example .env
```
Default configuration values:
```ini
PORT=3000
HOST=0.0.0.0
SLIDESHOW_DURATION_SECONDS=6
MAX_FILE_SIZE_MB=10
MAX_FILES_PER_UPLOAD=5
RETENTION_HOURS=24
ADMIN_API_KEY=admin123
```

### 3. Start the Server
```bash
npm start
```
The server will start on port `3000`:
- **Visitor Mobile Portal:** [http://localhost:3000/](http://localhost:3000/)
- **Smart TV Slideshow Screen:** [http://localhost:3000/tv.html](http://localhost:3000/tv.html)
- **Admin & Moderation Panel:** [http://localhost:3000/admin.html](http://localhost:3000/admin.html) *(Default Key: `admin123`)*

---

## 📺 How to Connect a Smart TV on the Local Network

1. Make sure your computer and Smart TV are connected to the same Wi-Fi / Local Network.
2. Note your computer's local IP address (e.g. `192.168.1.150`).
3. On the Smart TV web browser, navigate to:
   ```
   http://192.168.1.150:3000/tv.html
   ```
4. Click **"Fullscreen"** on the TV interface (or press F11).
5. The TV will display an ambient QR code pointing directly to your local IP (`http://192.168.1.150:3000/`). Guests can scan the QR code with their phones and start uploading photos immediately!

---

## 🧪 Running Automated Tests

The repository includes comprehensive automated tests covering visitor identity resolution, file validation, and queue scheduling:
```bash
npm test
```
All 16 tests in 3 test suites will run and pass cleanly:
- `tests/visitor.test.js`: Visitor identity matching, PIN verification, visit increments, consent withdrawal.
- `tests/upload.test.js`: File type validation, 10MB limit enforcement, mandatory consent check, past photo grouping.
- `tests/queue.test.js`: FIFO queue order, concurrent multi-upload scheduling, starvation prevention, real-time photo removal.

For the step-by-step manual test plan and scenario results, see [TESTING.md](TESTING.md).

---

## 📂 Project Directory Structure

```
visitor-photo-slideshow/
├── .env.example              # Configuration template with placeholder values
├── .gitignore                # Excludes node_modules, database files, and uploaded media
├── package.json              # Project dependencies, scripts, and Jest config
├── README.md                 # Main documentation and run instructions
├── ASSUMPTIONS.md            # Documented requirements gaps, design decisions & tradeoffs
├── ARCHITECTURE.md           # Stack choices, data model, and Mermaid architecture diagrams
├── AI_LOG.md                 # 5-10 key prompts & 2 documented cases of AI mistakes and fixes
├── TESTING.md                # Automated test summary & documented manual test plan with results
├── server/
│   ├── app.js                # Express app setup and middleware configuration
│   ├── server.js             # HTTP & Socket.IO server startup and graceful shutdown
│   ├── config.js             # Centralized environment configuration
│   ├── db/
│   │   └── database.js       # SQLite connection, schema migrations, and WAL mode
│   ├── services/
│   │   ├── visitorService.js # Returning visitor lookup, registration, and PIN verification
│   │   ├── photoService.js   # Photo storage, expiration calculations, and ambient reel
│   │   ├── queueService.js   # Display queue state machine, FIFO ordering, and fair-share cap
│   │   └── socketService.js  # Real-time WebSocket emitter synchronizing TV screens
│   ├── middlewares/
│   │   ├── upload.js         # Multer configuration, MIME filter, and file size limits
│   │   └── errorHandler.js   # Centralized error handler
│   └── routes/
│       ├── visitorRoutes.js  # /api/visitors (identity lookup, consent withdrawal)
│       ├── uploadRoutes.js   # /api/upload (multipart photo upload)
│       ├── slideshowRoutes.js# /api/slideshow (live state, dynamic QR code generation)
│       └── adminRoutes.js    # /api/admin (moderation, playback controls, audit trail)
├── public/
│   ├── index.html            # Mobile-friendly visitor upload portal
│   ├── tv.html               # Smart TV slideshow screen with Ken Burns transitions
│   ├── admin.html            # Administrator moderation and control dashboard
│   ├── css/
│   │   └── styles.css        # Responsive styling, glassmorphism, and animations
│   ├── js/
│   │   ├── upload.js         # Visitor form logic, live returning guest lookup, previews
│   │   ├── tv.js             # TV Socket.IO sync, audio chime, and timer progress bar
│   │   └── admin.js          # Admin console logic, photo takedown, and duration slider
│   └── uploads/              # Local storage for visitor photos (.gitkeep preserved)
└── tests/
    ├── visitor.test.js       # Visitor service integration tests
    ├── upload.test.js        # File validation and upload route tests
    └── queue.test.js         # Concurrency, queue order, and moderation tests
```

---

## 📄 Submission Compliance Checklist

- [x] **README.md:** What the app does, tech stack, setup and run instructions.
- [x] **ASSUMPTIONS.md:** Detailed answers for returning visitor identity, privacy/consent, and concurrency.
- [x] **AI_LOG.md:** Key prompt interactions and at least 2 specific AI mistakes with detection and fixes.
- [x] **ARCHITECTURE.md:** Stack choices with reasons, data model, and Mermaid diagrams.
- [x] **Tests:** Automated tests (`npm test`) and documented manual test plan with results ([TESTING.md](TESTING.md)).
- [x] **.env.example:** Placeholder values only; no secrets committed.
- [x] **Commit History:** Multiple regular, meaningful git commits showing project evolution.
