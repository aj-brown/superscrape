import type { Logger, LogLevel, LogFormat, LogContext, TimerHandle } from './types';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(
  component: string,
  minLevel: LogLevel = 'debug',
  format: LogFormat = 'text'
): Logger {
  const minLevelValue = LOG_LEVELS[minLevel];

  function logText(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `${timestamp} [${level.toUpperCase()}] [${component}] ${message}`;
    console[level](formattedMessage, context);
  }

  function logJson(level: LogLevel, message: string, context?: LogContext): void {
    const logEntry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
    };
    if (context !== undefined) {
      logEntry.context = context;
    }
    process.stderr.write(JSON.stringify(logEntry) + '\n');
  }

  function log(level: LogLevel, message: string, context?: LogContext): void {
    if (LOG_LEVELS[level] < minLevelValue) {
      return;
    }

    if (format === 'json') {
      logJson(level, message, context);
    } else {
      logText(level, message, context);
    }
  }

  function startTimer(): TimerHandle {
    const startTime = Date.now();

    return {
      end: () => {
        return Date.now() - startTime;
      },
    };
  }

  return {
    debug: (message: string, context?: LogContext) => log('debug', message, context),
    info: (message: string, context?: LogContext) => log('info', message, context),
    warn: (message: string, context?: LogContext) => log('warn', message, context),
    error: (message: string, context?: LogContext) => log('error', message, context),
    startTimer,
  };
}
