import type { Logger, LogLevel, LogContext, TimerHandle } from './types';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(component: string, minLevel: LogLevel = 'debug'): Logger {
  const minLevelValue = LOG_LEVELS[minLevel];

  function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= minLevelValue;
  }

  function formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} [${level.toUpperCase()}] [${component}] ${message}`;
  }

  function log(level: LogLevel, message: string, context?: LogContext): void {
    if (!shouldLog(level)) {
      return;
    }

    const formattedMessage = formatMessage(level, message);

    switch (level) {
      case 'debug':
        console.debug(formattedMessage, context);
        break;
      case 'info':
        console.info(formattedMessage, context);
        break;
      case 'warn':
        console.warn(formattedMessage, context);
        break;
      case 'error':
        console.error(formattedMessage, context);
        break;
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
