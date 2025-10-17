import { TransformCommand } from '../../src/commands/transform.command.js';

describe('TransformCommand', () => {
  it('should create an instance', () => {
    const command = new TransformCommand();
    expect(command).toBeInstanceOf(TransformCommand);
  });
});
