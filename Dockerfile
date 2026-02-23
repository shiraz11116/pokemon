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
RUN npm install
RUN echo "Building React production app..." && \
    npm run build && \
    echo "Build completed. Checking build folder..." && \
    ls -la build/ && \
    echo "Build files created successfully!"

# Go back to main app directory
WORKDIR /usr/src/app

# Verify the build exists in the correct location
RUN echo "Verifying build location..." && \
    ls -la pokemon-dashboard/build/ && \
    echo "Found build files at pokemon-dashboard/build/"

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