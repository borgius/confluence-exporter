import { buildConfig, type RawEnv, type CliFlags } from '../../src/util/config';

describe('Unit: config validation', () => {
  const validEnv: RawEnv = {
    CONFLUENCE_BASE_URL: 'https://test.atlassian.net',
    CONFLUENCE_USERNAME: 'testuser',
    CONFLUENCE_PASSWORD: 'testpass',
    LOG_LEVEL: 'info'
  };

  const validFlags: CliFlags = {
    spaceKey: 'TEST',
    outDir: './test-output',
    dryRun: false,
    concurrency: 5,
    resume: false,
    fresh: false
  };

  describe('buildConfig function', () => {
    it('validates required env and CLI flags successfully', () => {
      const config = buildConfig(validEnv, validFlags);
      
      expect(config).toMatchObject({
        spaceKey: 'TEST',
        baseUrl: 'https://test.atlassian.net',
        username: 'testuser',
        password: 'testpass',
        outputDir: './test-output',
        dryRun: false,
        concurrency: 5,
        logLevel: 'info',
        resume: false,
        fresh: false
      });
      
      expect(config.retry).toBeDefined();
      expect(config.cleanup).toBeDefined();
    });

    it('requires CONFLUENCE_BASE_URL', () => {
      const invalidEnv = { ...validEnv, CONFLUENCE_BASE_URL: undefined };
      
      expect(() => buildConfig(invalidEnv, validFlags))
        .toThrow('CONFLUENCE_BASE_URL is required');
    });

    it('requires CONFLUENCE_USERNAME and PASSWORD', () => {
      const invalidEnv1 = { ...validEnv, CONFLUENCE_USERNAME: undefined };
      const invalidEnv2 = { ...validEnv, CONFLUENCE_PASSWORD: undefined };
      
      expect(() => buildConfig(invalidEnv1, validFlags))
        .toThrow('CONFLUENCE_USERNAME and CONFLUENCE_PASSWORD are required');
      
      expect(() => buildConfig(invalidEnv2, validFlags))
        .toThrow('CONFLUENCE_USERNAME and CONFLUENCE_PASSWORD are required');
    });

    it('requires spaceKey', () => {
      const invalidFlags = { ...validFlags, spaceKey: undefined };
      
      expect(() => buildConfig(validEnv, invalidFlags))
        .toThrow('spaceKey is required');
    });

    it('validates logLevel values', () => {
      const invalidEnv = { ...validEnv, LOG_LEVEL: 'invalid' };
      
      expect(() => buildConfig(invalidEnv, validFlags))
        .toThrow('Invalid logLevel: invalid');
    });

    it('accepts valid logLevel values', () => {
      const levels = ['debug', 'info', 'warn', 'error'];
      
      for (const level of levels) {
        const env = { ...validEnv, LOG_LEVEL: level };
        const config = buildConfig(env, validFlags);
        expect(config.logLevel).toBe(level);
      }
    });

    it('defaults logLevel to info when not provided', () => {
      const envWithoutLevel = { ...validEnv, LOG_LEVEL: undefined };
      const config = buildConfig(envWithoutLevel, validFlags);
      expect(config.logLevel).toBe('info');
    });
  });

  describe('operation flags validation', () => {
    it('prevents resume and fresh flags together', () => {
      const invalidFlags = { ...validFlags, resume: true, fresh: true };
      
      expect(() => buildConfig(validEnv, invalidFlags))
        .toThrow('Cannot specify both --resume and --fresh');
    });

    it('allows resume flag alone', () => {
      const flagsWithResume = { ...validFlags, resume: true };
      const config = buildConfig(validEnv, flagsWithResume);
      expect(config.resume).toBe(true);
      expect(config.fresh).toBe(false);
    });

    it('allows fresh flag alone', () => {
      const flagsWithFresh = { ...validFlags, fresh: true };
      const config = buildConfig(validEnv, flagsWithFresh);
      expect(config.fresh).toBe(true);
      expect(config.resume).toBe(false);
    });
  });

  describe('processing options validation', () => {
    it('defaults concurrency to 8 when not provided', () => {
      const flagsWithoutConcurrency = { ...validFlags, concurrency: undefined };
      const config = buildConfig(validEnv, flagsWithoutConcurrency);
      expect(config.concurrency).toBe(8);
    });

    it('uses provided concurrency when valid', () => {
      const flagsWithConcurrency = { ...validFlags, concurrency: 12 };
      const config = buildConfig(validEnv, flagsWithConcurrency);
      expect(config.concurrency).toBe(12);
    });

    it('defaults concurrency when zero or negative', () => {
      const flagsWithZero = { ...validFlags, concurrency: 0 };
      const flagsWithNegative = { ...validFlags, concurrency: -5 };
      
      expect(buildConfig(validEnv, flagsWithZero).concurrency).toBe(8);
      expect(buildConfig(validEnv, flagsWithNegative).concurrency).toBe(8);
    });

    it('includes limit when provided and positive', () => {
      const flagsWithLimit = { ...validFlags, limit: 100 };
      const config = buildConfig(validEnv, flagsWithLimit);
      expect(config.limit).toBe(100);
    });

    it('excludes limit when zero or negative', () => {
      const flagsWithZeroLimit = { ...validFlags, limit: 0 };
      const flagsWithNegativeLimit = { ...validFlags, limit: -10 };
      
      expect(buildConfig(validEnv, flagsWithZeroLimit).limit).toBeUndefined();
      expect(buildConfig(validEnv, flagsWithNegativeLimit).limit).toBeUndefined();
    });
  });

  describe('cleanup options validation', () => {
    it('disables cleanup when cleanupDisable flag is set', () => {
      const flagsWithDisabled = { ...validFlags, cleanupDisable: true };
      const config = buildConfig(validEnv, flagsWithDisabled);
      expect(config.cleanup.enabled).toBe(false);
    });

    it('validates cleanup intensity levels', () => {
      const validIntensities = ['light', 'medium', 'heavy'];
      
      for (const intensity of validIntensities) {
        const flagsWithIntensity = { ...validFlags, cleanupIntensity: intensity };
        const config = buildConfig(validEnv, flagsWithIntensity);
        expect(config.cleanup.intensity).toBe(intensity);
        expect(config.cleanup.enabled).toBe(true);
      }
    });

    it('rejects invalid cleanup intensity', () => {
      const flagsWithInvalid = { ...validFlags, cleanupIntensity: 'invalid' };
      
      expect(() => buildConfig(validEnv, flagsWithInvalid))
        .toThrow('Invalid cleanup intensity: invalid');
    });

    it('defaults cleanup intensity to medium', () => {
      const config = buildConfig(validEnv, validFlags);
      expect(config.cleanup.intensity).toBe('medium');
      expect(config.cleanup.enabled).toBe(true);
    });
  });

  describe('defaults and fallbacks', () => {
    it('sets default outputDir when not provided', () => {
      const flagsWithoutOutDir = { ...validFlags, outDir: undefined };
      const config = buildConfig(validEnv, flagsWithoutOutDir);
      expect(config.outputDir).toBe('spaces');
    });

    it('includes retry policy configuration', () => {
      const config = buildConfig(validEnv, validFlags);
      expect(config.retry).toMatchObject({
        maxAttempts: expect.any(Number),
        baseDelayMs: expect.any(Number),
        maxDelayMs: expect.any(Number),
        jitterRatio: expect.any(Number)
      });
    });

    it('handles optional rootPageId', () => {
      const flagsWithRoot = { ...validFlags, rootPageId: '12345' };
      const flagsWithoutRoot = { ...validFlags, rootPageId: undefined };
      
      expect(buildConfig(validEnv, flagsWithRoot).rootPageId).toBe('12345');
      expect(buildConfig(validEnv, flagsWithoutRoot).rootPageId).toBeUndefined();
    });
  });
});
