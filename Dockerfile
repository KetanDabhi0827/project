# ==============================================================================
# Multi-stage Dockerfile for Visitor Photo Slideshow
# Light-weight, secure Node.js alpine container with persistent data volumes
# ==============================================================================

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install build dependencies if needed for native modules
RUN apk add --no-cache python3 make g++

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy application code
COPY server/ ./server/
COPY public/ ./public/

# Ensure runtime directories exist with appropriate permissions
RUN mkdir -p data public/uploads

# Expose HTTP port
EXPOSE 3000

# Set default production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Mountable persistent volumes for SQLite and user-uploaded media
VOLUME ["/app/data", "/app/public/uploads"]

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/slideshow/settings || exit 1

# Start the application server
CMD ["node", "server/server.js"]
