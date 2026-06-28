FROM node:22-alpine

LABEL maintainer="OSTM"

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy source code
COPY src/ src/

# Create required directories
RUN mkdir -p config/tunnels keys logs/stats

# Default env vars (override via docker-compose or -e)
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV LOG_LEVEL=info
ENV DATA_DIR=./config
ENV KEYS_DIR=./keys
ENV LOGS_DIR=./logs

EXPOSE 8080

USER node

CMD ["node", "src/server.js"]
