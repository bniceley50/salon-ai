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