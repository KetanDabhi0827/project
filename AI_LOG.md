# AI_LOG.md: Interaction Log & Prompt Engineering History

This document chronicles key interactions, prompt directives, and design steering during the development of the **Visitor Photo Slideshow** application, highlighting **specific cases where the AI made mistakes**, how they were detected, and how they were corrected.

---

## Log Entry 1: Architecture & Technology Stack Selection
* **Directive / Prompt:**  
  > *"Design a robust, real-time application for a smart TV visitor photo slideshow. The app must run seamlessly on both desktop monitors and embedded smart TV web browsers without requiring complex compilation steps for evaluators."*
* **AI Initial Proposal:**  
  The AI suggested a Next.js 14 full-stack app with TypeScript and Prisma.
* **Human Course Correction:**  
  While Next.js is popular, running Next.js with WebSockets on local networks for Smart TVs requires complex custom server setups or third-party cloud brokers (like Pusher), and requires multi-gigabyte build steps. We instructed the AI to use **Node.js + Express + Socket.IO + SQLite (WAL mode) with a vanilla HTML5/CSS3 frontend served directly from Express**. This guarantees that evaluators can simply run `npm install` and `npm start` on any computer and test TV, mobile, and admin interfaces instantly.

---

## Log Entry 2: Windows PowerShell Environment & Command Invocation
* **Directive / Prompt:**  
  > *"Initialize the project dependencies and verify the runtime environment."*
* **Observation / Issue:**  
  Running `npm -v` in PowerShell hit Windows script execution restrictions (`npm.ps1 cannot be loaded because running scripts is disabled`). Additionally, using bash-style `&&` chaining failed under PowerShell syntax.
* **Resolution:**  
  We directed the execution to invoke `npm.cmd` directly (bypassing the `.ps1` restriction) and utilized PowerShell-compliant statement separators (`;`) for multi-command sequences.

---

## Log Entry 3: Case 1 — AI Mistake: ESM Dependency Import Error in CommonJS Test Suite
* **Directive / Prompt:**  
  > *"Set up automated testing with Jest and Supertest to verify visitor registration, photo upload validation, and queue scheduling."*
* **What the AI Did Wrong:**  
  The AI installed and imported the external `uuid` npm package (`const { v4: uuidv4 } = require('uuid');`) across all service files and route handlers. Modern versions of `uuid` (v11+) are distributed strictly as ECMAScript Modules (ESM). When Jest ran in a CommonJS environment, it immediately threw fatal runtime errors across every test suite:
  ```
  FAIL tests/queue.test.js
  Must use import to load ES Module: ...\node_modules\uuid\dist-node\index.js
  The file contains ESM syntax (import/export) that could not be executed as CommonJS.
  ```
* **How We Noticed:**  
  Executing `npm test` failed on the first command run before any test assertions could execute.
* **How We Fixed It:**  
  Instead of adding bloated Babel transforms or ESM loaders to Jest, we directed the AI to replace the external `uuid` package with Node.js's built-in cryptographic API:
  ```javascript
  const crypto = require('crypto');
  const uuidv4 = () => crypto.randomUUID();
  ```
  `crypto.randomUUID()` is natively available in Node.js 16+, provides higher entropy, eliminates a third-party dependency, and works universally across both CommonJS and ESM without any transpilation.

---

## Log Entry 4: Case 2 — AI Mistake: Test State Pollution on Repeated Runs (Non-Idempotent Database)
* **Directive / Prompt:**  
  > *"Write integration tests verifying that first-time visitors have `isReturning: false` and `visitCount: 1`, and returning visitors have `isReturning: true` and incremented visit counts."*
* **What the AI Did Wrong:**  
  The AI wrote tests that inserted visitor records directly into the shared local SQLite database (`./data/slideshow.db`) without cleaning up or resetting the tables between runs.  
  On the initial test execution, the tests passed (`PASS tests/visitor.test.js`, `PASS tests/upload.test.js`). However, when running `npm test` a second time, the database still contained the records from the first run. As a result, the tests failed with assertion mismatches:
  ```
  ● Visitor Service › should register a new visitor and issue a 4-digit PIN
    Expected: false
    Received: true   // Alice Wonder already existed in the DB!

  ● Visitor Service › should increment visit count
    Expected: 2
    Received: 4      // Visit count kept compounding on each test run!
  ```
* **How We Noticed:**  
  A critical software quality practice is ensuring automated tests are **idempotent** (they must pass consistently when run 10 times in a row). Re-running `npm test` failed immediately.
* **How We Fixed It:**  
  We instructed the AI to enforce strict test isolation by introducing database purges in the `beforeAll` hooks of each test suite:
  ```javascript
  beforeAll(async () => {
    await initSchema();
    const db = getDatabase();
    await runAsync(db, 'DELETE FROM photos');
    await runAsync(db, 'DELETE FROM visitors');
    await runAsync(db, 'DELETE FROM consent_logs');
  });
  ```
  After adding table isolation and timer cleanup in `afterAll`, the test suite runs cleanly and deterministically on every single execution.

---

## Log Entry 5: Starvation Prevention in Returning Visitor Queue
* **Directive / Prompt:**  
  > *"If a returning visitor has visited 10 times previously and uploaded 30 photos in total, how should their session be scheduled on the smart TV without starving new visitors?"*
* **AI Initial Proposal:**  
  The AI initially queued all 30 historical photos followed by the new photo, resulting in a single visitor holding the public screen for over 3 minutes.
* **Human Steering & Refinement:**  
  We directed the AI to implement a **Fair-Share past photo cap**: the system takes at most the **5 most recent historical photos** plus the newly uploaded photos for that session (`selectedPast = pastPhotos.slice(-5)`). This honors returning guests while keeping the screen dynamic and responsive for other attendees.

---

## Log Entry 6: Privacy & Takedown Architecture (GDPR / Right to be Forgotten)
* **Directive / Prompt:**  
  > *"Photos of people will be displayed on a public TV in an event space. Design privacy protection mechanisms beyond a simple consent checkbox."*
* **AI Implementation:**  
  Guided the AI to implement a three-tiered privacy architecture:
  1. **Consent Gate:** Mandatory unchecked consent box; uploads without explicit consent are rejected by both frontend and backend.
  2. **Personal Management PIN:** Every visitor receives a lightweight 4-digit PIN to access the self-service **"Right to be Forgotten"** tab and immediately purge all their photos.
  3. **Live WebSocket Moderation:** Administrators have a real-time console that can hide any image in $< 200\text{ms}$ with zero TV screen refresh.
  4. **Retention Sweeper:** Automated background worker purges photos older than 24 hours.

---

## Log Entry 7: Case 3 — AI Mistake: Smart TV Slide Freeze & Transition Glitch
* **User Directive (Gujarati):**  
  > *"tvslideshow ma slide change anthi thati and thodu tamari rite change kari apo"*  
  > *(The TV slideshow slides are not changing cleanly and sometimes freeze; improve and customize it.)*
* **What the AI Did Wrong:**  
  The initial Smart TV slideshow used a single DOM `<img>` tag and updated its `src` directly when the server sent `slideshow:slide-change`. On low-memory smart TV browsers or slow Wi-Fi connections, this caused:
  1. A jarring black flash while the new image loaded.
  2. If a network packet was dropped, the server timer expired without the TV receiving the next slide event, causing the TV to freeze indefinitely on the current image.
* **How We Noticed:**  
  User feedback during live testing on TV display confirmed the slide advancement stopped cycling under real network conditions.
* **How We Fixed It:**  
  1. Replaced the single-element image rendering with a **Dual-Buffer Crossfade Display Engine** (`#slideImageA` and `#slideImageB`), smoothly alternating opacity so the incoming photo preloads in the inactive buffer before crossfading.
  2. Added a **client-side fail-safe auto-advance timer** (`(duration + 1.5) * 1000 ms`), guaranteeing the TV automatically polls and requests the next slide even if a WebSocket packet is delayed.
  3. Added an **Interactive On-Screen TV Floating Controller Dock** (`⏮`, `⏸/▶️`, `⏭`, `3s/6s/10s` speed chips, `🔄`) with auto-hiding and TV remote navigation support (`Space`, `ArrowLeft`, `ArrowRight`, `P`, `F`).

---

## Log Entry 8: Live Audience Reactions & Dynamic Event Branding
* **User Directive:**  
  > *"ha step by step badha option add kari"*  
  > *(Yes, add all proposed advanced options step by step.)*
* **AI Implementation:**  
  1. Built the **Live Audience Emoji Reactions Engine** (`POST /api/slideshow/react`, `slideshow:reaction` event), rendering floating helium balloons on the Smart TV with dynamic X-positions and synthesized Web Audio popping sounds.
  2. Added the **Dynamic Event Branding Customizer** (`slideshow_settings` table, `POST /api/admin/settings`), providing 5 color theme palettes and 4 CSS transition effects (Ken Burns, 3D Flip, Zoom, Crossfade) that broadcast instantaneously across all screens.

---

## Log Entry 9: Returning Visitor Memory Lane Timeline & Digital Pass
* **Directive / Prompt:**  
  > *"Enrich returning visitor experience with historical timelines and contactless check-in."*
* **AI Implementation:**  
  1. Added relative and absolute memory date stamps (*"Memory from 18 Nov 2026"*) on past photos and a prominent visit details pill on the TV display.
  2. Implemented the **Digital Event Pass QR endpoint** (`GET /api/visitors/:id/pass`), allowing attendees to save a personal QR pass on their phone to re-identify with a single scan.

---

## Log Entry 10: AI Smart Moderation & Production Dockerization
* **Directive / Prompt:**  
  > *"Add automated safety checks for uploaded images and prepare the application for containerized cloud deployment."*
* **AI Implementation:**  
  1. Created `server/services/aiService.js` with heuristic binary header checks (detecting disguised PE/ELF executables) and polyglot embedded script tags (`<script>`, `<?php>`, `eval()`), preventing malicious uploads before disk writes.
  2. Added context-aware personalized AI arrival greetings generator tailored to time of day and returning visit counts.
  3. Created multi-stage `Dockerfile`, `docker-compose.yml`, and `.dockerignore` with persistent bind mounts for SQLite and uploaded media.
  4. Expanded the Jest automated test suite to 22 passing tests.

---

## Log Entry 11: Case 4 — AI Mistake: Smart TV Audio Autoplay Silence & Inaudible Feedback
* **User Directive (Gujarati):**  
  > *"song add karu hoe to back ground ma and sound na off on thi kay fer padto nathi svaj nathi avto"*  
  > *(If I want to add background music/songs, and toggling sound ON/OFF makes no difference, no sound comes out.)*
* **What the AI Did Wrong:**  
  The initial audio implementation only initialized Web Audio oscillators when a `slideshow:visitor-arrived` event occurred. When a user clicked "Sound: Off / On", no sound played immediately to confirm the state change, and because modern browsers suspend un-interacted `AudioContext` instances, background audio remained muted. Additionally, no background music (BGM) player or custom music selector existed.
* **How We Noticed:**  
  User explicitly reported that clicking the audio toggle button produced zero audible sound and requested background song capabilities.
* **How We Fixed It:**  
  1. Triggered `audioCtx.resume()` immediately within the user gesture event handler.
  2. Implemented an instant ascending synthesized chime (261Hz -> 392Hz) for audible feedback whenever the sound button is toggled.
  3. Added an HTML5 `<audio id="bgmAudio" loop>` player with a procedural pentatonic ambient synth fallback if no external MP3 is present on disk.
  4. Added an on-screen volume slider and a **"🎵 Pick Song"** custom audio file picker directly in the TV header.

---

## Log Entry 12: Case 5 — AI Mistake: TV Idle Autohide Concealed Visitor Identity
* **User Directive (Gujarati):**  
  > *"tv ma jiya niche name ne ae che aene hide nathi karva nu"*  
  > *(On the TV screen, where the visitor's name is at the bottom, do NOT hide that.)*
* **What the AI Did Wrong:**  
  When implementing the requested auto-hide feature for controls during fullscreen and idle viewing, the CSS rule `.idle-hidden` was applied to the entire bottom overlay container (`.tv-overlay-bottom`), which caused the visitor's name, badge, and photo counter to disappear along with the navigation buttons.
* **How We Noticed:**  
  User clarified that while control buttons and progress bars should disappear to keep the screen uncluttered, the visitor's name and visit status are essential event information and must remain permanently on screen.
* **How We Fixed It:**  
  1. Decoupled the bottom overlay DOM elements.
  2. Maintained `.tv-visitor-card` at fixed permanent visibility with high z-index and glassmorphic contrast.
  3. Applied the `.tv-autohide` class strictly to `#tvProgressGroup` (the seconds countdown bar), `.tv-control-bar`, and top-bar control pills.

---

## Log Entry 13: Celebratory Canvas Confetti, 1-Click Digital Pass Auto-fill & Live Demo Guide
* **User Directive (Gujarati):**  
  > *"have kay better kari saki" -> "ha kari apo aa badhu and github ma pan change karta rejo"*  
  > *(What else can we make better? -> Yes, do all of this and keep updating GitHub.)*
* **AI Implementation:**  
  1. **HTML5 Canvas Particle Confetti Engine:** Built a lightweight, zero-dependency confetti engine in `tv.js` that fires an explosion of multi-colored particles across the TV screen whenever a new visitor arrival banner appears.
  2. **1-Click Digital Pass Auto-fill:** Created the `#quickCheckInBar` and `#copyPassLinkBtn` on the visitor mobile portal, allowing guests to bookmark their personal check-in URL or paste QR tokens for instant pre-filling without re-typing.
  3. **Comprehensive Viva & Demo Guide (`DEMO_GUIDE.md`):** Authored a 2-minute live demo script with step-by-step instructions and deep technical answers to the top 10 anticipated academic/viva questions.
  4. **Free Cloud Deployment Blueprint (`render.yaml`):** Provided automated Render.com deployment configuration for 1-click cloud hosting.

