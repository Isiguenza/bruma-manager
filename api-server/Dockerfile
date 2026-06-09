FROM node:22-slim

WORKDIR /app

# Copy package files
COPY api-server/package.json api-server/package-lock.json* ./
RUN npm install

# Copy source
COPY api-server/ .

# Copy schema into src directory
COPY lib/db/schema.ts ./src/schema.ts

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npx", "tsx", "src/index.ts"]
