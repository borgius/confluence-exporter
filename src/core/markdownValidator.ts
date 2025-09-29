/**
 * Markdown file validation utilities
 * Validates basic structure of exported Markdown files per FR-015
 */

import { readFile } from 'fs/promises';
import matter from 'gray-matter';
import { logger } from '../util/logger.js';

export interface ValidationResult {
  isValid: boolean;
  filePath: string;
  errors: string[];
  warnings: string[];
}

export interface MarkdownValidationSummary {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  totalErrors: number;
  totalWarnings: number;
  results: ValidationResult[];
}

/**
 * Validates file extension
 */
function validateFileExtension(filePath: string, result: ValidationResult): void {
  if (!filePath.endsWith('.md')) {
    result.errors.push('File must have .md extension');
  }
}

/**
 * Validates front matter fields
 */
function validateFrontMatter(data: Record<string, unknown>, result: ValidationResult): void {
  const requiredFields = ['title', 'confluenceId', 'confluenceUrl', 'lastModified'];
  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    result.errors.push(`Missing required front matter fields: ${missingFields.join(', ')}`);
  }

  // Validate field types
  const stringFields = ['title', 'confluenceId', 'confluenceUrl', 'lastModified'];
  for (const field of stringFields) {
    if (data[field] && typeof data[field] !== 'string') {
      result.errors.push(`Front matter field "${field}" must be a string`);
    }
  }
}

/**
 * Validates markdown content structure
 */
function validateContentStructure(content: string, result: ValidationResult): void {
  if (content.trim().length === 0) {
    result.warnings.push('File has no content after front matter');
    return;
  }

  // Check for headings
  const hasHeading = content.split('\n').some(line => line.trim().startsWith('#'));
  if (!hasHeading) {
    result.warnings.push('Content has no headings - may indicate formatting issues');
  }

  // Check for broken image links
  const brokenImagePattern = /!\[.*?\]\(\s*\)/g;
  if (brokenImagePattern.test(content)) {
    result.warnings.push('Found empty image links - may indicate attachment processing issues');
  }
}

/**
 * Validates a single Markdown file for basic structure requirements
 */
export async function validateMarkdownFile(filePath: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    isValid: true,
    filePath,
    errors: [],
    warnings: [],
  };

  try {
    validateFileExtension(filePath, result);

    const content = await readFile(filePath, 'utf-8');
    
    if (content.trim().length === 0) {
      result.errors.push('File is empty');
      result.isValid = false;
      return result;
    }

    const parsed = matter(content);
    validateFrontMatter(parsed.data, result);
    validateContentStructure(parsed.content, result);

    result.isValid = result.errors.length === 0;

  } catch (error) {
    result.errors.push(`Failed to read or parse file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    result.isValid = false;
  }

  return result;
}

/**
 * Validates multiple Markdown files and returns a summary
 */
export async function validateMarkdownFiles(filePaths: string[]): Promise<MarkdownValidationSummary> {
  const results: ValidationResult[] = [];
  
  for (const filePath of filePaths) {
    try {
      const result = await validateMarkdownFile(filePath);
      results.push(result);
    } catch (error) {
      results.push({
        isValid: false,
        filePath,
        errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
      });
    }
  }

  const validFiles = results.filter(r => r.isValid).length;
  const invalidFiles = results.length - validFiles;
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

  const summary: MarkdownValidationSummary = {
    totalFiles: results.length,
    validFiles,
    invalidFiles,
    totalErrors,
    totalWarnings,
    results,
  };

  // Log summary
  logger.info('Markdown validation completed', {
    totalFiles: summary.totalFiles,
    validFiles: summary.validFiles,
    invalidFiles: summary.invalidFiles,
    totalErrors: summary.totalErrors,
    totalWarnings: summary.totalWarnings,
  });

  return summary;
}

/**
 * Logs detailed validation results
 */
export function logValidationResults(summary: MarkdownValidationSummary): void {
  // Log errors
  for (const result of summary.results) {
    if (result.errors.length > 0) {
      logger.error('Markdown validation errors', {
        filePath: result.filePath,
        errors: result.errors,
      });
    }
    
    if (result.warnings.length > 0) {
      logger.warn('Markdown validation warnings', {
        filePath: result.filePath,
        warnings: result.warnings,
      });
    }
  }

  // Log overall summary
  if (summary.invalidFiles > 0) {
    logger.error('Markdown validation failed for some files', {
      invalidFiles: summary.invalidFiles,
      totalErrors: summary.totalErrors,
    });
  } else {
    logger.info('All Markdown files passed validation', {
      totalFiles: summary.totalFiles,
      totalWarnings: summary.totalWarnings,
    });
  }
}
