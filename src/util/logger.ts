interface LogFields {
  [key: string]: unknown;
  msg: string;
  level: string;
  time: string; // ISO timestamp
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export class Logger {
  constructor(private level: LogLevel = 'info') {}

  private should(level: LogLevel) {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  private write(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
    if (!this.should(level)) return;
    const rec: LogFields = {
      level,
      msg,
      time: new Date().toISOString(),
      ...(fields || {})
    } as LogFields;
    process.stdout.write(JSON.stringify(rec) + '\n');
  }

  debug(msg: string, fields?: Record<string, unknown>) { this.write('debug', msg, fields); }
  info(msg: string, fields?: Record<string, unknown>) { this.write('info', msg, fields); }
  warn(msg: string, fields?: Record<string, unknown>) { this.write('warn', msg, fields); }
  error(msg: string, fields?: Record<string, unknown>) { this.write('error', msg, fields); }
}

export const logger = new Logger(process.env.LOG_LEVEL as LogLevel || 'info');
