/**
 * Command executor - orchestrates command execution
 */

import { ConfluenceConfig } from 'src/types.js';
import { CommandRegistry } from './registry.js';
import type { Command, CommandContext } from './types.js';

export class CommandExecutor {
  private registry: CommandRegistry;

  constructor(private config: ConfluenceConfig) {
    this.registry = new CommandRegistry(config);
  }

  /**
   * Validate commands and return parsed list
   */
  validateCommands(commands: string[]): Command[] {
    const validated: Command[] = [];

    for (const cmd of commands) {
      const command = cmd.toLowerCase();
      if (this.registry.isValidCommand(command)) {
        validated.push(command);
      } else {
        throw new Error(`Unknown command: "${cmd}"`);
      }
    }

    return validated;
  }

  /**
   * Execute a sequence of commands
   */
  async executeCommands(commands: Command[], context: CommandContext): Promise<void> {
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      
      if (i > 0) {
        console.log('\n' + '─'.repeat(60) + '\n');
      }

      const handler = this.registry.getHandler(command);
      if (!handler) {
        throw new Error(`No handler found for command: ${command}`);
      }

      await handler.execute(context);
    }
    
    console.log('\n✓ All commands completed successfully!');
  }

  /**
   * Get list of valid commands
   */
  getValidCommands(): Command[] {
    return this.registry.getValidCommands();
  }
}
