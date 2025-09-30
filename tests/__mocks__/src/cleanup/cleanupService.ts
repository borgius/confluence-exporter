// Mock for cleanupService to avoid unified ESM issues

export const createCleanupService = jest.fn(() => ({
  cleanup: jest.fn().mockResolvedValue({
    success: true,
    content: 'Cleaned content',
    rulesApplied: ['whitespace', 'typography'],
    rulesFailed: [],
    metrics: {
      processingTimeMs: 50,
      rulesProcessed: 2,
      charactersProcessed: 100
    }
  })
}));
