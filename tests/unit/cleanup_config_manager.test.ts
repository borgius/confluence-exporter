/**
 * Tests for cleanup configuration manager
 * Validates T135: Configuration management for cleanup intensity levels
 */

import { 
  createConfigFromIntensity,
  validateConfig,
  mergeConfigs,
  describeConfig,
  INTENSITY_DEFAULTS,
  AVAILABLE_CLEANUP_RULES
} from '../../src/cleanup/configManager.js';
import type { CleanupIntensity } from '../../src/models/markdownCleanup.js';

describe('Cleanup Configuration Manager', () => {
  
  describe('createConfigFromIntensity', () => {
    test('creates valid config for light intensity', () => {
      const config = createConfigFromIntensity('light');
      expect(config.intensity).toBe('light');
      expect(config.enabled).toBe(true);
      expect(config.preserveFormatting).toBe(true);
      expect(config.rules).toEqual(['typography']);
    });

    test('creates valid config for heavy intensity', () => {
      const config = createConfigFromIntensity('heavy');
      expect(config.intensity).toBe('heavy');
      expect(config.preserveFormatting).toBe(false);
      expect(config.rules).toContain('typography');
      expect(config.rules).toContain('whitespace');
    });

    test('applies overrides correctly', () => {
      const config = createConfigFromIntensity('light', {
        lineLength: 120,
        rules: ['typography', 'whitespace']
      });
      expect(config.lineLength).toBe(120);
      expect(config.rules).toEqual(['typography', 'whitespace']);
    });
  });

  describe('validateConfig', () => {
    test('validates correct configuration', () => {
      const result = validateConfig({
        enabled: true,
        intensity: 'medium',
        rules: ['typography'],
        lineLength: 100,
        locale: 'en-US',
        preserveFormatting: true
      });
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.normalizedConfig).toBeDefined();
    });

    test('rejects invalid intensity', () => {
      const result = validateConfig({
        enabled: true,
        intensity: 'invalid' as CleanupIntensity,
      });
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid intensity 'invalid'. Must be 'light', 'medium', or 'heavy'");
    });

    test('rejects invalid rules', () => {
      const result = validateConfig({
        enabled: true,
        intensity: 'medium',
        rules: ['typography', 'invalidRule']
      });
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Invalid rules: invalidRule');
    });

    test('warns about unsupported locale', () => {
      const result = validateConfig({
        enabled: true,
        intensity: 'medium',
        locale: 'unsupported-locale'
      });
      
      expect(result.warnings[0]).toContain("Locale 'unsupported-locale' is not fully supported");
    });

    test('warns about extreme line lengths', () => {
      const result = validateConfig({
        enabled: true,
        intensity: 'medium',
        lineLength: 45 // Between 40-49 to trigger warning for below recommended minimum of 50
      });
      
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('below recommended minimum');
    });
  });

  describe('mergeConfigs', () => {
    test('merges configurations with correct precedence', () => {
      const envConfig = { lineLength: 90 };
      const explicitConfig = { preserveFormatting: false };
      
      const merged = mergeConfigs(explicitConfig, envConfig, 'medium');
      
      expect(merged.intensity).toBe('medium'); // from default
      expect(merged.lineLength).toBe(90); // from env
      expect(merged.preserveFormatting).toBe(false); // from explicit (highest priority)
    });
  });

  describe('describeConfig', () => {
    test('provides readable description', () => {
      const config = INTENSITY_DEFAULTS.medium;
      const description = describeConfig(config);
      
      expect(description.enabled).toBe(true);
      expect(description.intensity).toBe('medium');
      expect(description.rulesCount).toBeGreaterThan(0);
    });
  });

  describe('constants', () => {
    test('AVAILABLE_CLEANUP_RULES contains expected rules', () => {
      expect(AVAILABLE_CLEANUP_RULES).toContain('typography');
      expect(AVAILABLE_CLEANUP_RULES).toContain('whitespace');
    });

    test('INTENSITY_DEFAULTS has all required intensities', () => {
      expect(INTENSITY_DEFAULTS.light).toBeDefined();
      expect(INTENSITY_DEFAULTS.medium).toBeDefined();
      expect(INTENSITY_DEFAULTS.heavy).toBeDefined();
    });
  });
});
