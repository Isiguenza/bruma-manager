FROM node:22-slim AS builder

WORKDIR /app

# Copy package files
COPY api-server/package.json api-server/package-lock.json* ./
RUN npm install

# Copy source and schema
COPY api-server/ .
COPY lib/db/schema.ts ./lib/db/schema.ts

# Build TypeScript
RUN npm run build

# Production image
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# Copy built files and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 4000

CMD ["node", "dist/index.js"]
