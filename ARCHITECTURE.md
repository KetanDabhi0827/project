# ARCHITECTURE.md: System Architecture & Technical Design

This document details the architectural design, stack choices, data model, and communication protocols for the **Visitor Photo Slideshow** system.

---

## 1. System Architecture Overview

The system is designed around an event-driven, real-time client-server architecture capable of supporting low-latency Smart TV synchronization, mobile visitor uploads, and administrative moderation simultaneously.

```mermaid
flowchart TD
    subgraph Clients["Client Layer"]
        Mobile["📱 Mobile Visitor Portal<br/>(/index.html)"]
        SmartTV["📺 Smart TV / Display Screen<br/>(/tv.html)"]
        Admin["💻 Moderator Dashboard<br/>(/admin.html)"]
    end

    subgraph Server["Server Layer (Node.js & Express)"]
        HTTPRouter["REST API Router<br/>(/api/upload, /api/visitors, /api/admin)"]
        SocketServer["Socket.IO WebSocket Server<br/>(Bidirectional Real-Time Sync)"]
        QueueManager["DisplayQueueManager<br/>(FIFO Queue & Starvation Capping)"]
        VisitorEngine["Visitor & Identity Service<br/>(Normalization & History Matching)"]
        MulterEngine["Multer File Validator<br/>(MIME & Size Enforcement)"]
    end

    subgraph Storage["Persistence & Media Layer"]
        SQLite[("SQLite Database<br/>WAL Mode enabled")]
        DiskStorage["Local File Storage<br/>(public/uploads/)"]
    end

    Mobile -->|"HTTP POST (Multipart Upload)"| HTTPRouter
    Mobile -->|"HTTP POST (/api/visitors/identify)"| HTTPRouter
    Admin -->|"HTTP GET/POST (Controls & Moderation)"| HTTPRouter
    Admin <-->|"WebSocket (Live Status & Queue Sync)"| SocketServer
    SmartTV <-->|"WebSocket (Slide Changes & New Arrivals)"| SocketServer

    HTTPRouter --> MulterEngine
    MulterEngine -->|"Store UUID Images"| DiskStorage
    HTTPRouter --> VisitorEngine
    VisitorEngine <--> SQLite
    HTTPRouter --> QueueManager
    QueueManager <--> SocketServer
```

---

## 2. Technology Stack & Decision Rationale

| Layer | Chosen Technology | Rationale & Tradeoffs |
| :--- | :--- | :--- |
| **Backend Runtime** | **Node.js (LTS v24)** | High-performance asynchronous non-blocking I/O ideal for handling multiple concurrent image uploads and continuous WebSocket connections. |
| **HTTP Framework** | **Express.js (v5)** | Lightweight, robust, industry-standard routing and middleware chaining for streaming multipart uploads and JSON APIs. |
| **Real-time Protocol** | **Socket.IO (v4)** | Provides low-latency, bidirectional WebSocket communication with automatic HTTP long-polling fallback, essential for embedded smart TV web browsers. |
| **Database** | **SQLite (via sqlite3 with WAL)** | Zero-configuration, serverless relational database stored as a single file. Configured with **Write-Ahead Logging (WAL)** to support concurrent reads and writes during simultaneous visitor uploads. |
| **File Handling** | **Multer** | Streaming multipart/form-data processor enforcing strict MIME verification, max file count (5), and max byte limits (10MB) before writing to disk. |
| **Frontend Clients** | **Modern Vanilla Web (HTML5/CSS3/ES6)** | **Zero-build setup**: No complex Webpack, Babel, or compilation required for evaluators. Extremely lightweight, fast to load on resource-constrained Smart TVs and mobile browsers. |
| **Styling & Effects** | **CSS3 Glassmorphism & Animations** | Native CSS Ken Burns pan-zoom, cross-fade transitions, responsive grid layouts, and countdown progress bars without heavy JavaScript UI libraries. |
| **Testing** | **Jest & Supertest** | Comprehensive automated unit and integration testing covering visitor resolution, queue scheduling, and HTTP endpoints. |

---

## 3. Data Model & Entity Relationship

The SQLite database enforces relational integrity with foreign key cascading and optimized indexes.

```mermaid
erDiagram
    VISITOR ||--o{ PHOTO : owns
    VISITOR ||--o{ CONSENT_LOG : audits

    VISITOR {
        string id PK "UUID"
        string name "Original visitor name"
        string normalized_name "Lowercased & trimmed"
        string identifier "Phone or Email"
        string pin "4-digit self-management PIN"
        int consent_given "1 = Consented, 0 = Revoked"
        string consent_timestamp "ISO-8601"
        int visit_count "Incremented on returning visits"
        string first_visited_at "ISO-8601"
        string last_visited_at "ISO-8601"
    }

    PHOTO {
        string id PK "UUID"
        string visitor_id FK "References VISITOR(id)"
        string filename "photo-UUID.ext"
        string original_name "Original client filename"
        string mime_type "image/jpeg, image/png, image/webp"
        int file_size "Size in bytes"
        int is_active "1 = Active, 0 = Moderated/Deleted"
        string visit_batch_id "UUID grouping upload session"
        string created_at "ISO-8601"
        string expires_at "ISO-8601 (Retention cutoff)"
    }

    CONSENT_LOG {
        string id PK "UUID"
        string visitor_id "Nullable for system events"
        string action "CONSENT_GRANTED, WITHDRAWN, MODERATED"
        string ip_hash "SHA-256(IP + salt)"
        string timestamp "ISO-8601"
        string details "Context string"
    }

    SLIDESHOW_SETTINGS {
        string key PK "e.g. slide_duration"
        string value "e.g. 6"
    }
```

### Table Definitions

1. **`visitors`**: Stores recognized attendees. Unique composite index on `(normalized_name, identifier)` guarantees deterministic identity matching.
2. **`photos`**: Stores metadata and file pointers for all uploaded media. Soft-deletion flag `is_active` enables instant moderation without corrupting history.
3. **`consent_logs`**: Immutable audit trail recording every privacy lifecycle action for compliance verification.
4. **`slideshow_settings`**: Key-value persistence for runtime parameters (e.g. slide duration).

---

## 4. End-to-End Sequence Diagram: Upload to TV Playback

The sequence diagram below illustrates what happens from the moment a returning visitor uploads photos to their appearance on the Smart TV screen.

```mermaid
sequenceDiagram
    autonumber
    actor Visitor as 📱 Returning Visitor
    participant Server as ⚙️ Express & Multer
    participant DB as 🗄️ SQLite Database
    participant Queue as 📋 DisplayQueueManager
    participant TV as 📺 Smart TV Screen

    Visitor->>Server: POST /api/upload (Name, Phone, Consent, Photos)
    Server->>Server: Validate MIME (image/*) & size (<10MB)
    Server->>DB: Query visitor by normalized (Name, Phone)
    DB-->>Server: Existing visitor found (visit_count: 2)
    Server->>DB: UPDATE visitors SET visit_count = 3
    Server->>DB: INSERT INTO photos (New photos with 24h expiration)
    Server->>DB: SELECT past photos WHERE visitor_id = X
    DB-->>Server: 2 past photos retrieved
    Server->>Queue: enqueueBatch(Visitor, 2 Past + 1 New Photo)
    
    alt TV Display is Idle / Playing Ambient
        Queue->>TV: WS Emit "slideshow:visitor-arrived" (Celebration banner)
        Queue->>TV: WS Emit "slideshow:slide-change" (Slide 1: Past Photo)
        TV->>TV: Play Ken Burns effect & Audio Chime
    else TV Display is Currently Playing Another Visitor
        Queue->>Queue: Push to pendingQueue (FIFO)
        Queue->>TV: WS Emit "slideshow:queue-update" (Up Next: Alice +1)
        TV->>TV: Render floating "Up Next" pill
    end

    Server-->>Visitor: 201 Created (PIN, Status, Confirmation)
```

---

## 5. Concurrency & Queue Management State Machine

To handle scenarios where 10 visitors submit photos simultaneously at an event, the `DisplayQueueManager` operates as a deterministic state machine:

```mermaid
stateDiagram-v2
    [*] --> Standby: App Launch (No Photos)
    Standby --> AmbientReel: Historical photos loaded
    Standby --> ActivePlaying: New visitor upload arrives
    AmbientReel --> ActivePlaying: New visitor upload arrives

    state ActivePlaying {
        [*] --> VisitorArrivalCelebration: Banner displayed (2.8s)
        VisitorArrivalCelebration --> DisplayPastPhotos: If returning visitor
        DisplayPastPhotos --> DisplayNewPhotos: All past photos shown
        DisplayNewPhotos --> CheckPendingQueue: Current batch finished
    }

    CheckPendingQueue --> ActivePlaying: Next batch waiting in pendingQueue (FIFO)
    CheckPendingQueue --> AmbientReel: pendingQueue is empty
    ActivePlaying --> Paused: Admin clicks Pause
    Paused --> ActivePlaying: Admin clicks Resume
```

### Key Queue Invariants
1. **FIFO Fairness:** Batches are dequeued in the exact order they finished uploading.
2. **Atomic Advancement:** Calling `next()` or expiration of the slide timer cleanly advances the index.
3. **Instant Moderation Propagation:** If an administrator or visitor deletes photo $X$, the queue removes $X$ immediately from active memory, advancing to the subsequent slide in $< 200\text{ms}$.
4. **Ambient Fallback:** When the queue reaches zero items, the display never goes black; it smoothly transitions to an ambient reel of approved past photos or the standby QR code card.
