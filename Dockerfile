# syntax=docker/dockerfile:1.4

# ==========================================
# Stage 1: Build the React + Three.js application
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies with frozen lockfile for build reproducibility
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source code
COPY . .

# Build production bundle
RUN npm run build

# ==========================================
# Stage 2: Production web server (Nginx Alpine)
# ==========================================
FROM nginx:alpine-slim AS runner

LABEL maintainer="SYNTHIA Community"
LABEL description="SYNTHIA - Embodied AI Simulator & Physics World"

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/healthz || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
