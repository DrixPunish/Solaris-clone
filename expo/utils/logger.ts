const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel = isDev ? 'debug' : 'warn';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

export const logger = {
  log: (...args: unknown[]) => {
    if (shouldLog('info')) {
      console.log(...args);
    }
  },
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn')) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
