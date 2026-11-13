# AI_LOG.md: Interaction Log & Prompt Engineering History

This document chronicles key interactions, prompt directives, and design steering during the development of the **Visitor Photo Slideshow** application, highlighting **two specific cases where the AI made mistakes**, how they were detected, and how they were corrected.

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
  After adding table isolation and timer cleanup in `afterAll`, the test suite runs cleanly and deterministically on every single execution (`16 passed, 16 total`).

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

## Log Entry 7: Embedded Smart TV Compatibility & Zero-Dependency Audio
* **Directive / Prompt:**  
  > *"Smart TV web browsers (like Samsung Tizen or LG webOS) often have restricted memory and can fail when downloading external MP3 assets or running heavy frameworks."*
* **AI Implementation:**  
  1. Frontend built with pure HTML5, CSS3, and ES6 JavaScript (no heavy virtual DOM overhead).
  2. Implemented arrival sound chimes using the browser's native **Web Audio API** (`AudioContext` oscillator synthesis), generating a pleasant dual-tone chime dynamically with 0 external network requests or audio asset dependencies.
