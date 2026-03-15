import pino, { Logger, LoggerOptions } from 'pino';
import { appConfig } from 'config';

const isDevelopment = appConfig.env === 'development';
const isTest = appConfig.env === 'test';

const logLevel = isTest ? 'warn' : isDevelopment ? 'debug' : 'info';

const options: LoggerOptions = {
  level: logLevel,
  base: {
    env: appConfig.env,
    service: 'jira-api',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
};

if (isDevelopment) {
  options.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
}

export const logger: Logger = pino(options);

export interface LogContext {
  requestId?: string;
  userId?: number;
  projectId?: number;
  [key: string]: unknown;
}

export function createLogger(context: LogContext = {}): Logger {
  return logger.child(context);
}

export function logRequest(
  requestId: string,
  method: string,
  path: string,
  context?: LogContext
): void {
  logger.info({ requestId, method, path, ...context }, 'Incoming request');
}

export function logResponse(
  requestId: string,
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  context?: LogContext
): void {
  logger.info(
    { requestId, method, path, statusCode, durationMs, ...context },
    'Request completed'
  );
}

export function logError(
  message: string,
  error: Error | unknown,
  context?: LogContext
): void {
  const errorObj = error instanceof Error 
    ? { name: error.name, message: error.message, stack: error.stack }
    : { error };
  logger.error({ ...errorObj, ...context }, message);
}

export function logExternalRequest(
  requestId: string | undefined,
  system: string,
  method: string,
  url: string,
  context?: LogContext
): void {
  logger.debug({ requestId, system, method, url, ...context }, 'External API request');
}

export function logExternalResponse(
  requestId: string | undefined,
  system: string,
  method: string,
  url: string,
  statusCode: number,
  durationMs: number,
  context?: LogContext
): void {
  logger.debug(
    { requestId, system, method, url, statusCode, durationMs, ...context },
    'External API response'
  );
}

export function logExternalError(
  requestId: string | undefined,
  system: string,
  method: string,
  url: string,
  error: Error | unknown,
  context?: LogContext
): void {
  const errorObj = error instanceof Error
    ? { name: error.name, message: error.message }
    : { error };
  logger.error(
    { requestId, system, method, url, ...errorObj, ...context },
    'External API error'
  );
}
