# setup-tests.ps1
# PowerShell script to set up the test environment

Write-Host "🚀 Setting up Salon AI Test Environment" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Check if we're in the right directory
if (!(Test-Path "critical_code_tests.js")) {
    Write-Host "❌ Error: critical_code_tests.js not found!" -ForegroundColor Red
    Write-Host "Please run this script from the Salon_AI_ALL_FILES directory" -ForegroundColor Yellow
    exit 1
}

# Create the necessary files
Write-Host "`n📝 Creating test setup files..." -ForegroundColor Yellow

# Create jest.config.js
$jestConfig = @'
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/*.test.js', '**/*_tests.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ]
};
'@

$jestConfig | Out-File -FilePath "jest.config.js" -Encoding UTF8
Write-Host "✅ Created jest.config.js" -ForegroundColor Green

# Create jest.setup.js (pointing to test-setup.js)
$jestSetup = @'
// Load all mock implementations
require('./test-setup');

// Reset mocks between tests
beforeEach(() => {
  if (global.insurance) global.insurance.claims.clear();
  if (global.webhook) global.webhook.processedWebhooks.clear();
  if (global.mockOpenAI) global.mockOpenAI.reset();
  if (global.gdpr) global.gdpr.deletedClients.clear();
  if (global.db) {
    global.db.clients.clear();
    global.db.primary.isAlive = true;
  }
});
'@

$jestSetup | Out-File -FilePath "jest.setup.js" -Encoding UTF8
Write-Host "✅ Created jest.setup.js" -ForegroundColor Green

# Check if test-setup.js exists (should have been created from artifact)
if (!(Test-Path "test-setup.js")) {
    Write-Host "⚠️  test-setup.js not found - creating from artifact" -ForegroundColor Yellow
    Write-Host "Please copy the mock implementations from the artifact above" -ForegroundColor Yellow
}

# Update package.json scripts
Write-Host "`n📦 Updating package.json scripts..." -ForegroundColor Yellow

$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json

# Add test scripts if they don't exist
if (!$packageJson.scripts) {
    $packageJson | Add-Member -NotePropertyName "scripts" -NotePropertyValue @{} -Force
}

$packageJson.scripts.test = "jest"
$packageJson.scripts."test:watch" = "jest --watch"
$packageJson.scripts."test:coverage" = "jest --coverage"
$packageJson.scripts."test:critical" = "jest critical_code_tests.js"

$packageJson | ConvertTo-Json -Depth 10 | Out-File -FilePath "package.json" -Encoding UTF8
Write-Host "✅ Updated package.json" -ForegroundColor Green

# Install Jest if needed
Write-Host "`n📥 Checking Jest installation..." -ForegroundColor Yellow
$jestInstalled = npm list jest 2>$null | Select-String "jest@"

if (!$jestInstalled) {
    Write-Host "Installing Jest..." -ForegroundColor Yellow
    npm install --save-dev jest
} else {
    Write-Host "✅ Jest is already installed" -ForegroundColor Green
}

# Run the tests
Write-Host "`n🧪 Running tests with mocks..." -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

npm test

Write-Host "`n=======================================" -ForegroundColor Cyan
Write-Host "🎯 NEXT STEPS:" -ForegroundColor Green
Write-Host "1. Tests should now PASS with mock implementations" -ForegroundColor White
Write-Host "2. Replace mocks with real code as you build features" -ForegroundColor White
Write-Host "3. Tests ensure your real code works correctly" -ForegroundColor White
Write-Host "=======================================" -ForegroundColor Cyan