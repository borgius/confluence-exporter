import { HelpCommand } from '../../src/commands/help.command.js';

describe('HelpCommand', () => {
  it('should create an instance', () => {
    const command = new HelpCommand();
    expect(command).toBeInstanceOf(HelpCommand);
  });
});
