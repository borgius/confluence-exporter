/**
 * CLI help output snapshot test
 * Implements T071: Add CLI help output snapshot test
 */

// Mock dependencies to test CLI in isolation
jest.mock('../../src/core/exportRunner.js');
jest.mock('../../src/cli/configLoader.js');
jest.mock('../../src/cli/progress.js');
jest.mock('../../src/cli/interrupt.js');

describe('CLI Help Output', () => {
  let mockStdout: string;
  let _mockStderr: string;
  let originalStdout: typeof process.stdout.write;
  let originalStderr: typeof process.stderr.write;
  let originalExit: typeof process.exit;
  let originalArgv: string[];

  beforeEach(() => {
    mockStdout = '';
    _mockStderr = '';
    
    // Store originals
    originalStdout = process.stdout.write;
    originalStderr = process.stderr.write;
    originalExit = process.exit;
    originalArgv = process.argv;
    
    // Mock process methods
    process.stdout.write = jest.fn((chunk: string) => {
      mockStdout += chunk;
      return true;
    });
    
    process.stderr.write = jest.fn((chunk: string) => {
      _mockStderr += chunk;
      return true;
    });
    
    process.exit = jest.fn((_code?: number) => {
      throw new Error(`Process.exit called with code ${_code}`);
    }) as never;
  });

  afterEach(() => {
    // Restore originals
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
    process.exit = originalExit;
    process.argv = originalArgv;
    
    jest.clearAllMocks();
    
    // Clear module cache to ensure fresh CLI instance
    jest.resetModules();
  });

  describe('Main Help Output', () => {
    it('should display main help with all commands and options', async () => {
      process.argv = ['node', 'cli.js', '--help'];
      
      try {
        // Dynamically import CLI to get fresh instance
        await import('../../src/cli/index.js');
      } catch {
        // Expected - CLI exits after showing help
      }

      expect(mockStdout).toMatchSnapshot('main-help-output');
    });

    it('should include required flags in help', async () => {
      process.argv = ['node', 'cli.js', '--help'];
      
      try {
        await import('../../src/cli/index.js');
      } catch {
        // Expected
      }

      // Check for required flags
      expect(mockStdout).toContain('--space');
      expect(mockStdout).toContain('--out');
    });

    it('should include optional flags in help', async () => {
      process.argv = ['node', 'cli.js', '--help'];
      
      try {
        await import('../../src/cli/index.js');
      } catch {
        // Expected
      }

      // Check for optional flags
      expect(mockStdout).toContain('--dry-run');
      expect(mockStdout).toContain('--concurrency');
      expect(mockStdout).toContain('--resume');
      expect(mockStdout).toContain('--fresh');
      expect(mockStdout).toContain('--root');
      expect(mockStdout).toContain('--log-level');
      expect(mockStdout).toContain('--config');
      expect(mockStdout).toContain('--attachment-threshold');
    });

    it('should display version information', async () => {
      process.argv = ['node', 'cli.js', '--version'];
      
      try {
        await import('../../src/cli/index.js');
      } catch {
        // Expected
      }

      expect(mockStdout).toMatch(/\d+\.\d+\.\d+/); // Version pattern
    });
  });

  describe('Exit Behavior', () => {
    it('should exit with code 0 for help', async () => {
      process.argv = ['node', 'cli.js', '--help'];
      
      try {
        await import('../../src/cli/index.js');
      } catch (error) {
        const _err = error as Error;
        expect(_err.message).toContain('Process.exit called with code 0');
      }

      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should exit with code 0 for version', async () => {
      process.argv = ['node', 'cli.js', '--version'];
      
      try {
        await import('../../src/cli/index.js');
      } catch (error) {
        const _err = error as Error;
        expect(_err.message).toContain('Process.exit called with code 0');
      }

      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('Snapshot Consistency', () => {
    it('should maintain consistent help output format', async () => {
      process.argv = ['node', 'cli.js', '--help'];
      
      try {
        await import('../../src/cli/index.js');
      } catch {
        // Expected
      }

      // Normalize line endings and remove dynamic content
      const normalizedOutput = mockStdout
        .replace(/\r\n/g, '\n')
        .replace(/v\d+\.\d+\.\d+/g, 'vX.X.X'); // Normalize version

      expect(normalizedOutput).toMatchSnapshot('normalized-help-output');
    });
  });
});
