/**
 * Command registry - maps command names to handlers
 */

import { HelpCommand } from './help.command.js';
import { IndexCommand } from './index.command.js';
import { PlanCommand } from './plan.command.js';
import { DownloadCommand } from './download.command.js';
import { TransformCommand } from './transform.command.js';
import type { Command, CommandHandler } from './types.js';

export class CommandRegistry {
  private handlers: Map<Command, CommandHandler>;

  constructor() {
    this.handlers = new Map<Command, CommandHandler>([
      ['help', new HelpCommand()],
      ['index', new IndexCommand()],
      ['plan', new PlanCommand()],
      ['download', new DownloadCommand()],
      ['transform', new TransformCommand()]
    ]);
  }

  getHandler(command: Command): CommandHandler | undefined {
    return this.handlers.get(command);
  }

  isValidCommand(command: string): command is Command {
    return this.handlers.has(command as Command);
  }

  getValidCommands(): Command[] {
    return Array.from(this.handlers.keys());
  }
}
