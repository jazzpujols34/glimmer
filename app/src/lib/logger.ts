/**
 * Development-only logger utility
 * Logs are stripped in production to reduce noise and improve performance
 */

const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  /** Debug logs - only in development */
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },

  /** Warnings - always logged */
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },

  /** Errors - always logged */
  error: (...args: unknown[]) => {
    console.error(...args);
  },

  /** Tagged debug log for specific modules */
  debug: (tag: string, ...args: unknown[]) => {
    if (isDev) console.log(`[${tag}]`, ...args);
  },
};
