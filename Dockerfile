# Stage 1: Build Frontend
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
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
