/**
 * Command executor - orchestrates command execution
 */

import { CommandRegistry } from './registry.js';
import type { Command, CommandContext } from './types.js';

export class CommandExecutor {
  private registry: CommandRegistry;

  constructor() {
    this.registry = new CommandRegistry();
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
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   Minimal Confluence to Markdown Exporter          ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

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
