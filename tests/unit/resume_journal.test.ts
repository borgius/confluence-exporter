/**
 * Unit tests for resume journal logic
 * Implements T069: Add unit tests for resume journal logic
 */

import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { ResumeModeGuard } from '../../src/core/resumeGuard.js';
import type { ExportConfig } from '../../src/models/entities.js';

// Mock fs operations
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

const mockFs = {
  existsSync: existsSync as jest.MockedFunction<typeof existsSync>,
  readFileSync: readFileSync as jest.MockedFunction<typeof readFileSync>,
  unlinkSync: unlinkSync as jest.MockedFunction<typeof unlinkSync>,
};

describe('ResumeModeGuard', () => {
  let guard: ResumeModeGuard;
  const testOutputDir = '/test/output';
  const sentinelPath = join(testOutputDir, '.export-in-progress');
  const completedPath = join(testOutputDir, '.export-completed');

  beforeEach(() => {
    guard = new ResumeModeGuard(testOutputDir);
    jest.clearAllMocks();
  });

  describe('Resume State Detection', () => {
    it('should detect no previous state when no files exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const state = guard.checkResumeState();
      
      expect(state.isInterrupted).toBe(false);
      expect(state.sentinelExists).toBe(false);
      expect(state.canResume).toBe(false);
      expect(state.mustChooseMode).toBe(false);
    });

    it('should detect interrupted state when sentinel exists', () => {
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: '2025-09-29T10:00:00Z',
        signal: 'SIGINT'
      }));
      
      const state = guard.checkResumeState();
      
      expect(state.isInterrupted).toBe(true);
      expect(state.sentinelExists).toBe(true);
      expect(state.canResume).toBe(true);
      expect(state.mustChooseMode).toBe(true);
      expect(state.interruptReason).toBe('SIGINT');
    });

    it('should detect completed state when both files exist', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: '2025-09-29T10:00:00Z',
        message: 'Export completed'
      }));
      
      const state = guard.checkResumeState();
      
      expect(state.isInterrupted).toBe(true);
      expect(state.sentinelExists).toBe(true);
      expect(state.canResume).toBe(false); // Cannot resume if completed
      expect(state.mustChooseMode).toBe(true);
    });

    it('should handle corrupted sentinel file gracefully', () => {
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue('invalid json {');
      
      const state = guard.checkResumeState();
      
      expect(state.isInterrupted).toBe(true);
      expect(state.sentinelExists).toBe(true);
      expect(state.canResume).toBe(true);
      expect(state.interruptReason).toBe('Unknown interruption');
    });

    it('should parse timestamp correctly', () => {
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: '2025-09-29T10:00:00Z',
        signal: 'SIGTERM'
      }));
      
      const state = guard.checkResumeState();
      
      expect(state.lastModified).toEqual(new Date('2025-09-29T10:00:00Z'));
      expect(state.interruptReason).toBe('SIGTERM');
    });
  });

  describe('Configuration Validation', () => {
    const createConfig = (resume = false, fresh = false): ExportConfig => ({
      spaceKey: 'TEST',
      outputDir: testOutputDir,
      dryRun: false,
      concurrency: 1,
      resume,
      fresh,
      logLevel: 'info',
      username: 'user',
      password: 'pass',
      baseUrl: 'http://example.com',
      retry: {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterRatio: 0.1,
      },
      cleanup: {
        enabled: true,
        intensity: 'medium',
        lineLength: 92,
        locale: 'en-us',
        preserveFormatting: true,
      },
    });

    it('should allow normal mode when no previous state exists', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const validation = guard.validateConfig(createConfig());
      
      expect(validation.isValid).toBe(true);
      expect(validation.mode).toBe('normal');
      expect(validation.shouldAbort).toBe(false);
      expect(validation.message).toContain('No previous export state found');
    });

    it('should require explicit mode when previous state exists', () => {
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: '2025-09-29T10:00:00Z',
        signal: 'SIGINT'
      }));
      
      const validation = guard.validateConfig(createConfig());
      
      expect(validation.isValid).toBe(false);
      expect(validation.shouldAbort).toBe(true);
      expect(validation.message).toContain('Previous export state detected');
      expect(validation.message).toContain('--resume');
      expect(validation.message).toContain('--fresh');
    });

    it('should allow resume mode when state can be resumed', () => {
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: '2025-09-29T10:00:00Z',
        signal: 'SIGINT'
      }));
      
      const validation = guard.validateConfig(createConfig(true, false));
      
      expect(validation.isValid).toBe(true);
      expect(validation.mode).toBe('resume');
      expect(validation.shouldAbort).toBe(false);
      expect(validation.message).toContain('Resuming export');
    });

    it('should reject resume mode when cannot resume', () => {
      mockFs.existsSync.mockReturnValue(true); // Both sentinel and completed exist
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: '2025-09-29T10:00:00Z',
        message: 'Completed'
      }));
      
      const validation = guard.validateConfig(createConfig(true, false));
      
      expect(validation.isValid).toBe(false);
      expect(validation.mode).toBe('resume');
      expect(validation.shouldAbort).toBe(true);
      expect(validation.message).toContain('Cannot resume');
    });

    it('should allow fresh mode when previous state exists', () => {
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: '2025-09-29T10:00:00Z'
      }));
      
      const validation = guard.validateConfig(createConfig(false, true));
      
      expect(validation.isValid).toBe(true);
      expect(validation.mode).toBe('fresh');
      expect(validation.shouldAbort).toBe(false);
      expect(validation.message).toContain('Starting fresh export');
    });
  });

  describe('Resume Mode Enforcement', () => {
    const createConfig = (resume = false, fresh = false): ExportConfig => ({
      spaceKey: 'TEST',
      outputDir: testOutputDir,
      dryRun: false,
      concurrency: 1,
      resume,
      fresh,
      logLevel: 'info',
      username: 'user',
      password: 'pass',
      baseUrl: 'http://example.com',
      retry: {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterRatio: 0.1,
      },
      cleanup: {
        enabled: true,
        intensity: 'medium',
        lineLength: 92,
        locale: 'en-us',
        preserveFormatting: true,
      },
    });

    it('should enforce validation and return result', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const result = guard.enforce(createConfig());
      
      expect(result.isValid).toBe(true);
      expect(result.mode).toBe('normal');
    });

    it('should return error result for invalid configurations', () => {
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({}));
      
      const result = guard.enforce(createConfig());
      
      expect(result.isValid).toBe(false);
      expect(result.shouldAbort).toBe(true);
    });
  });

  describe('State Cleanup', () => {
    it('should clear existing sentinel file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.unlinkSync.mockReturnValue(undefined);
      
      guard.clearResumeState();
      
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(sentinelPath);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(completedPath);
    });

    it('should handle missing files gracefully', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      guard.clearResumeState();
      
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should handle file deletion errors', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      // Should not throw
      expect(() => guard.clearResumeState()).not.toThrow();
    });
  });

  describe('State Description', () => {
    it('should describe no previous state', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const description = guard.getStateDescription();
      
      expect(description).toBe('No previous export state');
    });

    it('should describe resumable state', () => {
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
      }));
      
      const description = guard.getStateDescription();
      
      expect(description).toContain('Export interrupted');
      expect(description).toContain('can resume or start fresh');
    });

    it('should describe completed state', () => {
      mockFs.existsSync.mockReturnValue(true); // Both files exist
      mockFs.readFileSync.mockReturnValue(JSON.stringify({}));
      
      const description = guard.getStateDescription();
      
      expect(description).toContain('Previous export completed');
      expect(description).toContain('can start fresh');
    });
  });

  describe('Relative Time Formatting', () => {
    it('should format recent times correctly', () => {
      const recentTime = new Date(Date.now() - 30000); // 30 seconds ago
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: recentTime.toISOString()
      }));
      
      const description = guard.getStateDescription();
      
      expect(description).toContain('just now');
    });

    it('should format hours correctly', () => {
      const hoursAgo = new Date(Date.now() - 7200000); // 2 hours ago
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: hoursAgo.toISOString()
      }));
      
      const description = guard.getStateDescription();
      
      expect(description).toContain('2 hours ago');
    });

    it('should format days correctly', () => {
      const daysAgo = new Date(Date.now() - 172800000); // 2 days ago
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: daysAgo.toISOString()
      }));
      
      const description = guard.getStateDescription();
      
      expect(description).toContain('2 days ago');
    });
  });

  describe('Integration Scenarios', () => {
    const createConfig = (resume = false, fresh = false): ExportConfig => ({
      spaceKey: 'TEST',
      outputDir: testOutputDir,
      dryRun: false,
      concurrency: 1,
      resume,
      fresh,
      logLevel: 'info',
      username: 'user',
      password: 'pass',
      baseUrl: 'http://example.com',
      retry: {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterRatio: 0.1,
      },
      cleanup: {
        enabled: true,
        intensity: 'medium',
        lineLength: 92,
        locale: 'en-us',
        preserveFormatting: true,
      },
    });

    it('should handle complete fresh start workflow', () => {
      // No previous state
      mockFs.existsSync.mockReturnValue(false);
      
      // Check state
      const state = guard.checkResumeState();
      expect(state.mustChooseMode).toBe(false);
      
      // Validate normal config
      const validation = guard.validateConfig(createConfig());
      expect(validation.isValid).toBe(true);
      expect(validation.mode).toBe('normal');
    });

    it('should handle resume workflow', () => {
      // Previous interrupted state exists
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        timestamp: '2025-09-29T10:00:00Z',
        signal: 'SIGINT'
      }));
      
      // Check state
      const state = guard.checkResumeState();
      expect(state.canResume).toBe(true);
      expect(state.mustChooseMode).toBe(true);
      
      // Validate resume config
      const validation = guard.validateConfig(createConfig(true, false));
      expect(validation.isValid).toBe(true);
      expect(validation.mode).toBe('resume');
    });

    it('should handle fresh restart workflow', () => {
      // Previous state exists
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({}));
      
      // Check state
      const state = guard.checkResumeState();
      expect(state.mustChooseMode).toBe(true);
      
      // Validate fresh config
      const validation = guard.validateConfig(createConfig(false, true));
      expect(validation.isValid).toBe(true);
      expect(validation.mode).toBe('fresh');
      
      // Clear state
      mockFs.unlinkSync.mockReturnValue(undefined);
      guard.clearResumeState();
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it('should reject ambiguous configuration', () => {
      // Previous state exists
      mockFs.existsSync.mockImplementation((path) => {
        return path === sentinelPath;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({}));
      
      // Try normal config without specifying mode
      const validation = guard.validateConfig(createConfig());
      expect(validation.isValid).toBe(false);
      expect(validation.shouldAbort).toBe(true);
      expect(validation.message).toContain('must choose');
    });
  });
});
