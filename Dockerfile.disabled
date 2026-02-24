# RAILWAY NUCLEAR REBUILD - Feb 24 2026 12:45 AM
# Force complete cache invalidation with new Dockerfile
FROM node:20-alpine

# Install necessary packages for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /usr/src/app

# NUCLEAR CACHE BUSTER - TIMESTAMP: 1708732500
RUN echo "NUCLEAR REBUILD: $(date) - Forcing Railway to use Node 20 + React build!"

# Copy all source code first (required for React build)
COPY . .

# Install backend dependencies (full install for build tools)
RUN echo "Installing backend dependencies with build tools..." && \
    npm install && \
    echo "Backend dependencies installed successfully!"

# Install frontend dependencies and build React app
WORKDIR /usr/src/app/pokemon-dashboard

# Ensure package files exist and show debug info
RUN echo "=== FRONTEND BUILD DEBUG ===" && \
    echo "Current directory: $(pwd)" && \
    echo "Package.json exists: $(test -f package.json && echo 'YES' || echo 'NO')" && \
    ls -la package* || echo "No package files found!" && \
    echo "=== END DEBUG ==="

# Install React dependencies with verbose output
RUN echo "Installing React dependencies..." && \
    npm install && \
    echo "React dependencies installed successfully!" && \
    echo "Installed packages:" && \
    npm list --depth=0

# Set production environment for React build
ENV NODE_ENV=production

# Build React app with maximum verbosity
RUN echo "=== STARTING REACT BUILD ===" && \
    echo "Environment: $NODE_ENV" && \
    echo "Building React production app..." && \
    npm run build && \
    echo "=== REACT BUILD COMPLETED ===" && \
    echo "Build verification:" && \
    ls -la build/ && \
    echo "Critical files check:" && \
    test -f build/index.html && echo "✅ index.html EXISTS" || echo "❌ index.html MISSING" && \
    test -d build/static && echo "✅ static directory EXISTS" || echo "❌ static directory MISSING" && \
    echo "Build file count:" && \
    find build -type f | wc -l && \
    echo "=== BUILD VERIFICATION COMPLETE ==="

# Go back to main app directory
WORKDIR /usr/src/app

# Final verification from main directory  
RUN echo "=== FINAL VERIFICATION ===" && \
    echo "React build location check:" && \
    ls -la pokemon-dashboard/build/ && \
    echo "Server will look for: pokemon-dashboard/build/index.html" && \
    test -f pokemon-dashboard/build/index.html && echo "✅ SERVER WILL FIND REACT APP" || echo "❌ SERVER WILL NOT FIND REACT APP" && \
    echo "=== VERIFICATION COMPLETE ==="

# Clean up after build (keep only production dependencies for backend)
RUN echo "Cleaning up development dependencies..." && \
    npm prune --production && \
    echo "Cleanup completed!"

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Change ownership of app directory
RUN chown -R nextjs:nodejs /usr/src/app
USER nextjs

# Expose port (Railway uses PORT env variable)
EXPOSE $PORT

# Start application
CMD ["npm", "start"]