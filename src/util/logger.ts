interface LogFields {
  [key: string]: unknown;
  msg: string;
  level: string;
  time: string; // ISO timestamp
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'json' | 'human';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// Icons and colors for each log level
const LEVEL_STYLES: Record<LogLevel, { icon: string; color: string }> = {
  debug: { icon: '🔍', color: COLORS.gray },
  info: { icon: 'ℹ️ ', color: COLORS.blue },
  warn: { icon: '⚠️ ', color: COLORS.yellow },
  error: { icon: '❌', color: COLORS.red }
};

export class Logger {
  constructor(
    private level: LogLevel = 'info',
    private format: LogFormat = 'human'
  ) {}

  private should(level: LogLevel) {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }

  private formatFields(fields?: Record<string, unknown>): string {
    if (!fields || Object.keys(fields).length === 0) return '';
    
    const formatted = Object.entries(fields)
      .map(([key, value]) => {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        return `${COLORS.dim}${key}=${valueStr}${COLORS.reset}`;
      })
      .join(' ');
    
    return ` ${formatted}`;
  }

  private writeHuman(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
    const { icon, color } = LEVEL_STYLES[level];
    const timestamp = `${COLORS.gray}${this.formatTime(new Date())}${COLORS.reset}`;
    const levelStr = `${color}${level.toUpperCase()}${COLORS.reset}`;
    const fieldsStr = this.formatFields(fields);
    
    process.stdout.write(`${timestamp} ${icon} ${levelStr} ${msg}${fieldsStr}\n`);
  }

  private writeJson(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
    const rec: LogFields = {
      level,
      msg,
      time: new Date().toISOString(),
      ...(fields || {})
    } as LogFields;
    process.stdout.write(JSON.stringify(rec) + '\n');
  }

  private write(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
    if (!this.should(level)) return;
    
    if (this.format === 'human') {
      this.writeHuman(level, msg, fields);
    } else {
      this.writeJson(level, msg, fields);
    }
  }

  debug(msg: string, fields?: Record<string, unknown>) { this.write('debug', msg, fields); }
  info(msg: string, fields?: Record<string, unknown>) { this.write('info', msg, fields); }
  warn(msg: string, fields?: Record<string, unknown>) { this.write('warn', msg, fields); }
  error(msg: string, fields?: Record<string, unknown>) { this.write('error', msg, fields); }
}

export const logger = new Logger(
  process.env.LOG_LEVEL as LogLevel || 'info',
  process.env.LOG_FORMAT as LogFormat || 'human'
);
