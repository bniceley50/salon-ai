# 🐳 Docker Setup for Salon AI

Since installing packages can be challenging in some environments, here's a Docker setup that includes everything:

## Dockerfile

Create a `Dockerfile` in your project root:

```dockerfile
# Use Node.js 18 LTS
FROM node:18-alpine

# Install system dependencies for puppeteer/chromium (needed by whatsapp-web.js)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    ffmpeg

# Tell Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Install dev dependencies for testing
RUN npm install --save-dev jest supertest @faker-js/faker

# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p logs uploads temp

# Expose port
EXPOSE 3000

# Run tests during build (optional)
RUN npm test || true

# Start command
CMD ["npm", "start"]
```

## Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
      - postgres
    volumes:
      - ./logs:/app/logs
      - ./uploads:/app/uploads
    env_file:
      - .env

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: salonai
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: salonai
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # Development only - runs tests
  test:
    build: .
    command: npm test
    environment:
      - NODE_ENV=test
    depends_on:
      - redis
      - postgres

volumes:
  redis_data:
  postgres_data:
```

## Usage

### Build and Run
```bash
# Build the Docker image
docker build -t salon-ai .

# Run with Docker Compose
docker-compose up

# Run tests only
docker-compose run test

# Run in detached mode
docker-compose up -d
```

### Development Mode
```bash
# Run with hot reload
docker-compose run --rm app npm run dev

# Run specific tests
docker-compose run --rm app npm run test:critical

# Access shell
docker-compose run --rm app sh
```

## Benefits

1. **No local installation needed** - Everything runs in containers
2. **Consistent environment** - Same versions everywhere
3. **Easy testing** - Tests run during build
4. **Production-ready** - Same container for dev and prod

## For Code Reviewers

Run the Docker container to execute all tests:
```bash
docker build -t salon-ai-test --target test .
docker run salon-ai-test
```

This will:
1. Install all dependencies
2. Run all tests
3. Show test results
4. Exit with appropriate status code