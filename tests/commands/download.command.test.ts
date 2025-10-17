import { DownloadCommand } from '../../src/commands/download.command.js';

describe('DownloadCommand', () => {
  it('should create an instance', () => {
    const command = new DownloadCommand();
    expect(command).toBeInstanceOf(DownloadCommand);
  });
});
