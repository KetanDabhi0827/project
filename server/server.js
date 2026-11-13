const http = require('http');
const app = require('./app');
const config = require('./config');
const { initSchema, closeDatabase } = require('./db/database');
const { initSocket } = require('./services/socketService');
const queueService = require('./services/queueService');
const photoService = require('./services/photoService');

const server = http.createServer(app);

// Initialize real-time WebSocket layer
initSocket(server);

async function startServer() {
  try {
    // 1. Initialize SQLite Database Schema
    await initSchema();
    console.log('[DB] Database schema and tables ready.');

    // 2. Initialize Slideshow Queue Service
    await queueService.init();
    console.log('[Queue] Slideshow Queue initialized.');

    // 3. Periodic photo retention cleanup (every 15 minutes)
    setInterval(async () => {
      try {
        const purgedCount = await photoService.purgeExpiredPhotos();
        if (purgedCount > 0) {
          console.log(`[Retention] Purged ${purgedCount} expired photo(s).`);
        }
      } catch (err) {
        console.warn('[Retention] Error during purge:', err.message);
      }
    }, 15 * 60 * 1000);

    // 4. Start HTTP Server
    server.listen(config.port, config.host, () => {
      console.log('====================================================');
      console.log('   📸 VISITOR PHOTO SLIDESHOW SERVER RUNNING');
      console.log('====================================================');
      console.log(` > Visitor Upload Portal:  http://localhost:${config.port}/`);
      console.log(` > Smart TV Slideshow:    http://localhost:${config.port}/tv.html`);
      console.log(` > Admin & Moderation:    http://localhost:${config.port}/admin.html`);
      console.log(` > Slide Duration:        ${config.slideDurationSeconds} seconds`);
      console.log(` > Retention Period:      ${config.retentionHours} hours`);
      console.log('====================================================');
    });
  } catch (err) {
    console.error('[Server] Startup error:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down gracefully...');
  server.close(async () => {
    await closeDatabase();
    console.log('[Server] Database closed and server terminated.');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\n[Server] SIGTERM received. Shutting down...');
  server.close(async () => {
    await closeDatabase();
    process.exit(0);
  });
});

if (require.main === module) {
  startServer();
}

module.exports = { server, startServer };
