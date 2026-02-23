# Use Node.js 20 Alpine image (Railway compatibility)
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

# Copy all source code first
COPY . .

# Install backend dependencies (full install for build tools)
RUN npm install

# Install frontend dependencies and build React app
WORKDIR /usr/src/app/pokemon-dashboard

# Ensure package files exist
RUN echo "Verifying frontend package files..." && ls -la package*

# Install React dependencies
RUN echo "Installing React dependencies..." && \
    npm install && \
    echo "Frontend dependencies installed successfully!"

# Set production environment for React build
ENV NODE_ENV=production

# Build React app with verbose output
RUN echo "Building React production app..." && \
    npm run build 2>&1 && \
    echo "React build completed. Verifying build output..." && \
    ls -la build/ && \
    echo "Build files:" && \
    find build -type f -name "*.js" -o -name "*.css" -o -name "*.html" | head -10 && \
    echo "React build verification complete!"

# Verify critical files exist
RUN test -f build/index.html || (echo "ERROR: index.html not found!" && exit 1)
RUN test -d build/static || (echo "ERROR: static directory not found!" && exit 1)

# Go back to main app directory
WORKDIR /usr/src/app

# Verify the build exists in the correct location
RUN echo "Final verification from main directory..." && \
    ls -la pokemon-dashboard/ && \
    echo "Checking build folder from main directory..." && \
    ls -la pokemon-dashboard/build/ && \
    echo "React build successfully created and verified!"

# Clean up after build (keep only production dependencies for backend)
RUN npm prune --production

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