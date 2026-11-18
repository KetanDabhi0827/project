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

    socket.on('slideshow:send-reaction', (data) => {
      const allowedEmojis = ['❤️', '🔥', '🎉', '👏', '🤩', '📸', '✨', '😍'];
      const emoji = data && data.emoji;
      if (allowedEmojis.includes(emoji)) {
        const payload = {
          emoji,
          xPos: Math.floor(Math.random() * 80) + 10,
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
        };
        io.emit('slideshow:reaction', payload);
      }
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

function broadcastReaction(emoji) {
  if (!io) return null;
  const allowedEmojis = ['❤️', '🔥', '🎉', '👏', '🤩', '📸', '✨', '😍'];
  if (allowedEmojis.includes(emoji)) {
    const payload = {
      emoji,
      xPos: Math.floor(Math.random() * 80) + 10,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    };
    io.emit('slideshow:reaction', payload);
    return payload;
  }
  return null;
}

module.exports = {
  initSocket,
  getIO,
  broadcastReaction,
};
