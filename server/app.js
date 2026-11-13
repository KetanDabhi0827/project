const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const errorHandler = require('./middlewares/errorHandler');

const visitorRoutes = require('./routes/visitorRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const slideshowRoutes = require('./routes/slideshowRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Standard middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public/ (including uploaded photos)
app.use(express.static(config.publicDir));
app.use('/uploads', express.static(config.uploadsDir));

// API routes
app.use('/api/visitors', visitorRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/slideshow', slideshowRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
