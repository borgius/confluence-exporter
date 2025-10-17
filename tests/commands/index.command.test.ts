import { IndexCommand } from '../../src/commands/index.command.js';

describe('IndexCommand', () => {
  it('should create an instance', () => {
    const command = new IndexCommand();
    expect(command).toBeInstanceOf(IndexCommand);
  });
});
