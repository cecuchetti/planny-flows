import { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from 'utils/logger';

export function requestLogger(): RequestHandler {
  return function(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const requestId = req.requestId;

    logger.info(
      { requestId, method: req.method, path: req.path, query: req.query },
      'Incoming request'
    );

    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const statusCode = res.statusCode;

      if (statusCode >= 400) {
        logger.warn(
          { requestId, method: req.method, path: req.path, statusCode, durationMs },
          'Request completed'
        );
      } else {
        logger.debug(
          { requestId, method: req.method, path: req.path, statusCode, durationMs },
          'Request completed'
        );
      }
    });

    next();
  };
}
