# Stage 1: Build Frontend
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Vite embeds these public values at build time, not when the container starts.
ARG VITE_API_URL=/api
ARG VITE_PUBLIC_APP_URL
ARG VITE_ADMIN_EMAILS
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_DATABASE_URL
RUN npm run build

# Stage 2: Production Environment
FROM node:20-alpine

WORKDIR /app

# Copy package files and install all dependencies
# We need tsx and typescript from devDependencies to run the backend without a pre-compile step
COPY package*.json ./
RUN npm install

# Copy source code and built frontend
COPY . .
COPY --from=builder /app/dist ./dist

# Expose port 3001
EXPOSE 3001

# Start the server using tsx
CMD ["npm", "start"]
