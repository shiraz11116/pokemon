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

# Copy package files (backend)
COPY package*.json ./

# Install backend dependencies
RUN npm install --only=production

# Copy frontend package files
COPY pokemon-dashboard/package*.json ./pokemon-dashboard/

# Install frontend dependencies
RUN cd pokemon-dashboard && npm install

# Copy app source code
COPY . .

# Build React frontend for production 
RUN cd pokemon-dashboard && npm run build

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