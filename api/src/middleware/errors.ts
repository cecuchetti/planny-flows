import { ErrorRequestHandler, Request } from 'express';
import { pick } from 'lodash';

import { CustomError } from 'errors';
import { logger } from 'utils/logger';

export const handleError: ErrorRequestHandler = (error, req: Request, res, _next) => {
  const { requestId } = req;
  const isAuthFailure =
    error instanceof CustomError && (error as CustomError).status === 401;

  if (!isAuthFailure) {
    if (error instanceof CustomError) {
      logger.warn(
        { requestId, code: error.code, status: error.status, message: error.message },
        'Request error'
      );
    } else {
      logger.error(
        { 
          requestId, 
          error: error instanceof Error 
            ? { name: error.name, message: error.message, stack: error.stack }
            : error 
        },
        'Unhandled error'
      );
    }
  }

  const isErrorSafeForClient = error instanceof CustomError;

  const clientError = isErrorSafeForClient
    ? pick(error, ['message', 'code', 'status', 'data'])
    : {
        message: 'Something went wrong, please contact our support.',
        code: 'INTERNAL_ERROR',
        status: 500,
        data: {},
      };

  res.status(clientError.status).send({ error: clientError, requestId });
};
