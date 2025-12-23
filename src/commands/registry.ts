/**
 * Command registry - maps command names to handlers
 */

import { HelpCommand } from './help.command.js';
import { IndexCommand } from './index.command.js';
import { UpdateCommand } from './update.command.js';
import { PlanCommand } from './plan.command.js';
import { DownloadCommand } from './download.command.js';
import { TransformCommand } from './transform.command.js';
import type { Command, CommandContext, CommandHandler } from './types.js';
import { ConfluenceConfig } from 'src/types.js';

export class CommandRegistry {
  private handlers: Map<Command, CommandHandler>;

  constructor(config?: ConfluenceConfig) {
    this.handlers = new Map<Command, CommandHandler>([
      ['help', new HelpCommand()],
      ['index', new IndexCommand(config)],
      ['update', new UpdateCommand(config)],
      ['plan', new PlanCommand(config)],
      ['download', new DownloadCommand(config)],
      ['transform', new TransformCommand(config)]
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
