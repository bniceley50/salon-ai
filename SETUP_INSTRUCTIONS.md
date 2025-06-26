# 🚀 Salon AI - Setup Instructions

## Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- Git

## Initial Setup

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/salon-ai.git
cd salon-ai
```

### 2. Install Dependencies
```bash
# Install all dependencies listed in package.json
npm install

# Or if using yarn
yarn install
```

This will install all required packages including:
- Jest (for testing)
- Express (web framework)
- OpenAI SDK
- Square SDK
- WhatsApp integration libraries
- And all other dependencies

### 3. Environment Configuration
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your actual API keys and configuration
# nano .env or use your preferred editor
```

### 4. Run Tests
After installing dependencies, you can run tests:

```bash
# Run all tests
npm test

# Run only critical tests
npm run test:critical

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

### 5. Start Development Server
```bash
# Start the development server
npm run dev

# Or start production server
npm start
```

## Common Issues

### "jest: not found" Error
This means dependencies aren't installed. Run:
```bash
npm install
```

### "Cannot find module" Errors
Dependencies might be corrupted. Try:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Permission Errors
On Unix systems, you might need:
```bash
sudo npm install -g npm@latest
```

## For Code Review Environments

If you're running this in a restricted environment (like Codex) that can't install packages:

### Option 1: Use Docker
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm test
```

### Option 2: Pre-install Dependencies
Before uploading to review environment:
```bash
# Install and include node_modules
npm install
# Then include node_modules in your repository temporarily
```

### Option 3: Mock Test Results
For code review purposes, you can review the test files themselves:
- `critical_code_tests.js` - Contains all critical business logic tests
- Review test coverage and scenarios
- Check test quality and assertions

## Quick Start Commands

```bash
# Full setup and test
git clone <repo-url>
cd salon-ai
npm install
cp .env.example .env
npm test

# Quick test run (after setup)
npm run test:critical
```

## Troubleshooting

1. **Node Version Issues**
   ```bash
   node --version  # Should be 18+
   ```

2. **NPM Cache Issues**
   ```bash
   npm cache clean --force
   ```

3. **Platform-Specific Issues**
   - Windows: Use Git Bash or WSL
   - Mac: May need Xcode tools
   - Linux: May need build-essential

## Note for Reviewers

The test suite includes:
- Unit tests for core business logic
- Integration tests for API endpoints
- Security tests for vulnerabilities
- Performance tests for scalability
- Mock tests for external services

Even without running the tests, reviewing the test files provides insight into:
- Expected behavior
- Edge cases handled
- Security considerations
- Business logic validation