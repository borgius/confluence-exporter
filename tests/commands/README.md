# Command Tests

This directory contains tests for all CLI commands in the Confluence to Markdown Exporter.

## Test Files

### `help.command.test.ts`
Basic constructor test for the Help command.

**Coverage:**
- ✅ Instance creation

### `index.command.test.ts`
Basic constructor test for the Index command.

**Coverage:**
- ✅ Instance creation

**Note:** Full API-dependent tests are not included because IndexCommand creates its own ConfluenceApi instance internally, which cannot be easily mocked with Jest + ESM modules. To fully test this command, it would need refactoring to use dependency injection.

### `plan.command.test.ts`
Basic constructor test for the Plan command.

**Coverage:**
- ✅ Instance creation

**Note:** Full API-dependent tests require dependency injection refactoring.

### `download.command.test.ts`
Basic constructor test for the Download command.

**Coverage:**
- ✅ Instance creation

**Note:** Full API-dependent tests require dependency injection refactoring.

### `transform.command.test.ts`
Basic constructor test for the Transform command.

**Coverage:**
- ✅ Instance creation

**Note:** Full API-dependent tests require dependency injection refactoring.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- help.command.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should transform"
```

## Test Structure

All command tests follow a consistent structure:

```typescript
describe('CommandName', () => {
  let command: CommandClass;
  let mockContext: CommandContext;
  
  beforeEach(() => {
    // Setup
  });
  
  afterEach(() => {
    // Cleanup
  });
  
  describe('feature group', () => {
    it('should do something specific', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

## Mocking Strategy

Due to ESM module constraints with Jest, most commands cannot be fully tested without refactoring:

- Commands create their own `ConfluenceApi` instances internally
- `jest.mock()` doesn't work reliably with ESM modules
- To enable full testing, commands would need to use **dependency injection** (accepting an API instance as a parameter)

## Current Test Coverage

- ✅ **Command instantiation** - All 5 commands can be constructed
- ✅ **Core transformations** - Transformer and Cleaner have full coverage
- ⚠️ **Command execution** - Requires refactoring for dependency injection

## Future Enhancements

To improve test coverage:

1. **Refactor commands for dependency injection**
   - Pass `ConfluenceApi` instance to command constructors
   - Enables easy mocking in tests

2. **Add integration tests**
   - Full workflow end-to-end testing
   - Mock Confluence server or use recorded responses

3. **Add performance tests**
   - Large space exports
   - Memory usage monitoring

4. **Add resilience tests**
   - API rate limiting
   - Network timeouts and retries
