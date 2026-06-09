FROM node:22-slim AS builder

WORKDIR /app/api-server

# Copy package files
COPY api-server/package.json api-server/package-lock.json* ./
RUN npm install

# Copy source
COPY api-server/ .

# Copy schema to parent lib directory to match local structure
WORKDIR /app
COPY lib/db/schema.ts ./lib/db/schema.ts

# Build TypeScript from api-server directory
WORKDIR /app/api-server
RUN npm run build

# Production image
FROM node:22-slim

WORKDIR /app/api-server
ENV NODE_ENV=production

# Copy built files and dependencies
COPY --from=builder /app/api-server/dist ./dist
COPY --from=builder /app/api-server/node_modules ./node_modules
COPY --from=builder /app/api-server/package.json ./
# Copy schema for runtime
COPY --from=builder /app/lib ../lib

EXPOSE 4000

CMD ["node", "dist/index.js"]
