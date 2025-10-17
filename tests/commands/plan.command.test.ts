import { PlanCommand } from '../../src/commands/plan.command.js';

describe('PlanCommand', () => {
  it('should create an instance', () => {
    const command = new PlanCommand();
    expect(command).toBeInstanceOf(PlanCommand);
  });
});
