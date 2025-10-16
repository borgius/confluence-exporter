/**
 * Configuration management for cleanup operations.
 * Implements T135: Configuration management for cleanup intensity levels.
 * Provides validation, environment variable support, and configuration merging.
 */

import type { CleanupConfig, CleanupIntensity } from '../models/markdownCleanup.js';
import { logger } from '../util/logger.js';

export interface CleanupConfigSchema {
  enabled: boolean;
  intensity: CleanupIntensity;
  rules?: string[];
  lineLength: number;
  locale: string;
  preserveFormatting: boolean;
}

export interface CleanupConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  normalizedConfig?: CleanupConfig;
}

/**
 * Available cleanup rules registry
 */
export const AVAILABLE_CLEANUP_RULES = [
  'typography',
  'whitespace',
  'headings', 
  'spacing',
  'wordWrap',
  'artifacts',
  'footnotes'
] as const;

export type AvailableCleanupRule = typeof AVAILABLE_CLEANUP_RULES[number];

/**
 * Default configurations for each intensity level
 */
export const INTENSITY_DEFAULTS: Record<CleanupIntensity, CleanupConfig> = {
  light: {
    enabled: true,
    intensity: 'light',
    rules: ['typography'],
    lineLength: 120,
    locale: 'en-US',
    preserveFormatting: true,
  },
  medium: {
    enabled: true,
    intensity: 'medium', 
    rules: ['typography', 'whitespace'],
    lineLength: 100,
    locale: 'en-US',
    preserveFormatting: true,
  },
  heavy: {
    enabled: true,
    intensity: 'heavy',
    rules: ['typography', 'whitespace', 'headings', 'spacing'],
    lineLength: 80,
    locale: 'en-US',
    preserveFormatting: false,
  },
};

/**
 * Configuration validation constraints
 */
export const CONFIG_CONSTRAINTS = {
  lineLength: {
    min: 50,
    max: 150,
    default: 100,
  },
  locale: {
    supported: ['en-US', 'en-GB', 'fr-FR', 'de-DE', 'es-ES'] as const,
    default: 'en-US',
  },
} as const;

export type SupportedLocale = typeof CONFIG_CONSTRAINTS.locale.supported[number];

/**
 * Environment variable mappings for cleanup configuration
 */
export const ENV_VAR_MAPPINGS = {
  CLEANUP_ENABLED: 'enabled',
  CLEANUP_INTENSITY: 'intensity',
  CLEANUP_RULES: 'rules',
  CLEANUP_LINE_LENGTH: 'lineLength',
  CLEANUP_LOCALE: 'locale',
  CLEANUP_PRESERVE_FORMATTING: 'preserveFormatting',
} as const;

/**
 * Create configuration from intensity level with optional overrides
 */
export function createConfigFromIntensity(
  intensity: CleanupIntensity,
  overrides: Partial<CleanupConfig> = {}
): CleanupConfig {
  const baseConfig = { ...INTENSITY_DEFAULTS[intensity] };
  const merged = { ...baseConfig, ...overrides };
  
  logger.debug('Created config from intensity', {
    intensity,
    hasOverrides: Object.keys(overrides).length > 0,
    finalRules: merged.rules,
    preserveFormatting: merged.preserveFormatting
  });
  
  return merged;
}

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnvironment(): Partial<CleanupConfig> {
  const envConfig: Partial<CleanupConfig> = {};
  
  // Load boolean values
  if (process.env.CLEANUP_ENABLED !== undefined) {
    envConfig.enabled = process.env.CLEANUP_ENABLED.toLowerCase() === 'true';
  }
  
  if (process.env.CLEANUP_PRESERVE_FORMATTING !== undefined) {
    envConfig.preserveFormatting = process.env.CLEANUP_PRESERVE_FORMATTING.toLowerCase() === 'true';
  }
  
  // Load intensity
  if (process.env.CLEANUP_INTENSITY) {
    const intensity = process.env.CLEANUP_INTENSITY.toLowerCase();
    if (['light', 'medium', 'heavy'].includes(intensity)) {
      envConfig.intensity = intensity as CleanupIntensity;
    }
  }
  
  // Load array values
  if (process.env.CLEANUP_RULES) {
    envConfig.rules = process.env.CLEANUP_RULES.split(',').map(rule => rule.trim());
  }
  
  // Load numeric values
  if (process.env.CLEANUP_LINE_LENGTH) {
    const lineLength = parseInt(process.env.CLEANUP_LINE_LENGTH, 10);
    if (!Number.isNaN(lineLength)) {
      envConfig.lineLength = lineLength;
    }
  }
  
  // Load string values
  if (process.env.CLEANUP_LOCALE) {
    envConfig.locale = process.env.CLEANUP_LOCALE;
  }
  
  logger.debug('Loaded cleanup config from environment', {
    keysFound: Object.keys(envConfig),
    values: envConfig
  });
  
  return envConfig;
}

/**
 * Validate basic configuration structure
 */
function validateBasicConfig(config: Partial<CleanupConfig>, errors: string[]): void {
  // Validate required fields exist if config is enabled
  if (config.enabled !== false) {
    if (config.intensity === undefined) {
      errors.push('intensity is required when cleanup is enabled');
    }
  }
  
  // Validate intensity
  if (config.intensity !== undefined) {
    if (!['light', 'medium', 'heavy'].includes(config.intensity)) {
      errors.push(`Invalid intensity '${config.intensity}'. Must be 'light', 'medium', or 'heavy'`);
    }
  }
}

/**
 * Validate rules configuration
 */
function validateRules(config: Partial<CleanupConfig>, errors: string[]): void {
  if (config.rules !== undefined) {
    if (!Array.isArray(config.rules)) {
      errors.push('rules must be an array of rule names');
    } else {
      const invalidRules = config.rules.filter((rule): rule is string => 
        typeof rule === 'string' && !AVAILABLE_CLEANUP_RULES.includes(rule as AvailableCleanupRule)
      );
      if (invalidRules.length > 0) {
        errors.push(`Invalid rules: ${invalidRules.join(', ')}. Available rules: ${AVAILABLE_CLEANUP_RULES.join(', ')}`);
      }
    }
  }
}

/**
 * Validate line length and locale configuration
 */
function validateLineContentConfig(config: Partial<CleanupConfig>, errors: string[], warnings: string[]): void {
  // Validate line length with stricter validation to match existing behavior
  if (config.lineLength !== undefined) {
    if (typeof config.lineLength !== 'number' || config.lineLength <= 0) {
      errors.push('lineLength must be a positive number');
    } else if (config.lineLength < 40 || config.lineLength > 200) {
      // Strict validation to match existing test expectations
      errors.push(`lineLength ${config.lineLength} must be between 40 and 200`);
    } else if (config.lineLength < CONFIG_CONSTRAINTS.lineLength.min) {
      warnings.push(`lineLength ${config.lineLength} is below recommended minimum of ${CONFIG_CONSTRAINTS.lineLength.min}`);
    } else if (config.lineLength > CONFIG_CONSTRAINTS.lineLength.max) {
      warnings.push(`lineLength ${config.lineLength} exceeds recommended maximum of ${CONFIG_CONSTRAINTS.lineLength.max}`);
    }
  }
  
  // Validate locale
  if (config.locale !== undefined) {
    if (typeof config.locale !== 'string') {
      errors.push('locale must be a string');
    } else if (!CONFIG_CONSTRAINTS.locale.supported.includes(config.locale as SupportedLocale)) {
      warnings.push(`Locale '${config.locale}' is not fully supported. Supported locales: ${CONFIG_CONSTRAINTS.locale.supported.join(', ')}`);
    }
  }
}

/**
 * Validate cleanup configuration
 */
export function validateConfig(config: Partial<CleanupConfig>): CleanupConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  validateBasicConfig(config, errors);
  validateRules(config, errors);
  validateLineContentConfig(config, errors, warnings);
  
  // Create normalized config if valid
  let normalizedConfig: CleanupConfig | undefined;
  if (errors.length === 0) {
    // Start with defaults for the specified intensity or 'medium' as fallback
    const intensity = config.intensity || 'medium';
    const baseConfig = INTENSITY_DEFAULTS[intensity];
    
    normalizedConfig = {
      ...baseConfig,
      ...config,
      intensity, // Ensure intensity is set
    } as CleanupConfig;
  }
  
  const result: CleanupConfigValidationResult = {
    isValid: errors.length === 0,
    errors,
    warnings,
    normalizedConfig,
  };
  
  logger.debug('Config validation completed', {
    isValid: result.isValid,
    errorCount: errors.length,
    warningCount: warnings.length,
    normalizedIntensity: normalizedConfig?.intensity
  });
  
  return result;
}

/**
 * Merge multiple configuration sources with precedence
 * Priority: explicit > environment > defaults
 */
export function mergeConfigs(
  explicitConfig: Partial<CleanupConfig> = {},
  environmentConfig?: Partial<CleanupConfig>,
  defaultIntensity: CleanupIntensity = 'medium'
): CleanupConfig {
  // Load environment config if not provided
  const envConfig = environmentConfig || loadConfigFromEnvironment();
  
  // Start with defaults for the requested intensity
  const baseConfig = INTENSITY_DEFAULTS[defaultIntensity];
  
  // Apply environment overrides
  const withEnv = { ...baseConfig, ...envConfig };
  
  // Apply explicit overrides (highest priority)
  const finalConfig = { ...withEnv, ...explicitConfig };
  
  logger.info('Merged cleanup configuration', {
    baseIntensity: defaultIntensity,
    envOverrides: Object.keys(envConfig).length,
    explicitOverrides: Object.keys(explicitConfig).length,
    finalRules: finalConfig.rules,
    finalIntensity: finalConfig.intensity
  });
  
  return finalConfig;
}

/**
 * Get configuration description for logging/debugging
 */
export function describeConfig(config: CleanupConfig): Record<string, unknown> {
  return {
    enabled: config.enabled,
    intensity: config.intensity,
    rulesCount: config.rules?.length || 0,
    ruleNames: config.rules,
    lineLength: config.lineLength,
    locale: config.locale,
    preserveFormatting: config.preserveFormatting,
  };
}
