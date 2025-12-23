export class Logger {
  private debugEnabled: boolean;
  private lastDebugTime: number;
  
  // ANSI color codes
  private colors = {
    reset: '\x1b[0m',
    gray: '\x1b[90m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    white: '\x1b[37m'
  };
  
  constructor(debug = false) {
    this.debugEnabled = debug || !!process.env.DEBUG;
    this.lastDebugTime = Date.now();
  }

  debug(...args: unknown[]) {
    if (this.debugEnabled) {
      const now = Date.now();
      const elapsed = now - this.lastDebugTime;
      this.lastDebugTime = now;
      // eslint-disable-next-line no-console
      console.debug(`${this.colors.cyan}[DEBUG +${elapsed}ms]${this.colors.reset}`, ...args);
    }
  }

  setDebug(enabled: boolean) {
    this.debugEnabled = !!enabled;
  }

  info(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.log(`${this.colors.blue}[INFO]${this.colors.reset}`, ...args);
  }

  warn(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.warn(`${this.colors.yellow}[WARN]${this.colors.reset}`, ...args);
  }

  error(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.error(`${this.colors.red}[ERROR]${this.colors.reset}`, ...args);
  }

  success(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.log(`${this.colors.green}[SUCCESS]${this.colors.reset}`, ...args);
  }
}

const logger = new Logger();
export { logger };
export default logger;
