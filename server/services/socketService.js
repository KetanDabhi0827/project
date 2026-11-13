const { Server } = require('socket.io');
const queueService = require('./queueService');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    // Send current state immediately upon connection
    socket.emit('slideshow:state', queueService.getQueueSummary());

    socket.on('slideshow:request-state', () => {
      socket.emit('slideshow:state', queueService.getQueueSummary());
    });

    socket.on('disconnect', () => {
      // Clean disconnect
    });
  });

  // Wire queueService events to Socket.IO broadcast
  queueService.on('slide-change', (slide) => {
    if (io) {
      io.emit('slideshow:slide-change', slide);
    }
  });

  queueService.on('visitor-arrived', (celebration) => {
    if (io) {
      io.emit('slideshow:visitor-arrived', celebration);
    }
  });

  queueService.on('queue-updated', (summary) => {
    if (io) {
      io.emit('slideshow:queue-update', summary);
    }
  });

  queueService.on('status-changed', (status) => {
    if (io) {
      io.emit('slideshow:status-update', status);
    }
  });

  queueService.on('settings-changed', (settings) => {
    if (io) {
      io.emit('slideshow:settings-update', settings);
    }
  });

  queueService.on('photo-removed', (data) => {
    if (io) {
      io.emit('slideshow:photo-removed', data);
    }
  });

  return io;
}

function getIO() {
  return io;
}

module.exports = {
  initSocket,
  getIO,
};
