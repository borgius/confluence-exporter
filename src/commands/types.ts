/**
 * Command-related type definitions
 */

import type { ConfluenceConfig } from '../types.js';

export type Command = 'help' | 'index' | 'download' | 'plan';

export interface CommandContext {
  config: ConfluenceConfig;
  args: Record<string, unknown>;
}

export interface CommandHandler {
  execute(context: CommandContext): Promise<void>;
}
