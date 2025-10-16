/**
 * Simple .env file loader
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export function loadEnv(envPath?: string): void {
  const path = envPath || resolve(process.cwd(), '.env');
  
  if (!existsSync(path)) {
    return; // .env is optional
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      // Skip empty lines and comments
      if (!line.trim() || line.trim().startsWith('#')) {
        continue;
      }

      // Parse KEY=value or KEY="value" or KEY='value'
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*["']?([^"'\n]*)["']?\s*$/);
      if (match) {
        const [, key, value] = match;
        // Only set if not already in environment
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not load .env file: ${error instanceof Error ? error.message : error}`);
  }
}
