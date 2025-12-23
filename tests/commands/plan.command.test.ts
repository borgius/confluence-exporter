import { PlanCommand } from '../../src/commands/plan.command.js';

describe('PlanCommand', () => {
  it('should create an instance', () => {
    const mockConfig = {
      baseUrl: 'https://example.com',
      username: 'user',
      password: 'pass',
      spaceKey: 'TEST',
      outputDir: './output'
    };
    const command = new PlanCommand(mockConfig);
    expect(command).toBeInstanceOf(PlanCommand);
  });
});
