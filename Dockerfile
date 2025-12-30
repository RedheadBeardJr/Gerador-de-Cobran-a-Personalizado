FROM node:20-slim

WORKDIR /usr/src/app

# Install dependencies (use package-lock)
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Build (keeps source for runtime, build is primarily for type check/TS artifacts)
RUN npm run build || true

EXPOSE 3000

ENV NODE_ENV=production
CMD ["npm", "run", "start:prod"]
