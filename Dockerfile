# ===== BUILD STAGE =====
# Compile native better-sqlite3 bindings against the target platform
FROM node:24-alpine AS builder

WORKDIR /app

# Install build tools required by better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci

# ===== PRODUCTION STAGE =====
FROM node:24-alpine AS production

WORKDIR /app

# Create a non-root user for security
RUN addgroup -S panda && adduser -S panda -G panda

# Copy compiled node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY server.js package.json ./
COPY index.html style.css game.js ./

# The SQLite DB lives in /app/data so it can be mounted as a volume
ENV DB_PATH=/app/data/highscores.db
RUN mkdir -p /app/data && chown -R panda:panda /app

USER panda

EXPOSE 3000

CMD ["node", "server.js"]
