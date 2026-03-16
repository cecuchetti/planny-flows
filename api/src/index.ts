import 'module-alias/register';
import 'dotenv/config';
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';

import { appConfig, validateConfig } from 'config';
import createDatabaseConnection from 'database/createConnection';
import { addRespondToResponse } from 'middleware/response';
import { authenticateUser } from 'middleware/authentication';
import { handleError } from 'middleware/errors';
import { addRequestId } from 'middleware/requestId';
import { requestLogger } from 'middleware/requestLogger';
import { RouteNotFoundError } from 'errors';
import { logger } from 'utils/logger';

import { attachPublicRoutes, attachPrivateRoutes } from './routes';

const establishDatabaseConnection = async (): Promise<void> => {
  try {
    await createDatabaseConnection();
    logger.info('Database connection established');
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Database connection failed');
    process.exit(1);
  }
};

const initializeExpress = (): void => {
  const app = express();

  const corsOrigins = [
    'http://localhost:8080',
    'http://localhost:8081',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:8081',
    /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:(8080|8081)$/,
    /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:(8080|8081)$/,
    /^http:\/\/[\w-]+\.local:(8080|8081)$/,
  ];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = corsOrigins.some(pattern =>
        typeof pattern === 'string' ? pattern === origin : pattern.test(origin)
      );
      callback(null, allowed);
    },
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(addRequestId());
  app.use(requestLogger());

  app.use(addRespondToResponse);

  attachPublicRoutes(app);

  app.use('/', authenticateUser);

  attachPrivateRoutes(app);

  app.use((req, _res, next) => next(new RouteNotFoundError(req.originalUrl)));
  app.use(handleError);

  app.listen(appConfig.port, '0.0.0.0', () => {
    logger.info({ port: appConfig.port, env: appConfig.env, host: '0.0.0.0' }, 'API server started');
  });
};

const initializeApp = async (): Promise<void> => {
  try {
    validateConfig();
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Configuration error');
    process.exit(1);
  }

  await establishDatabaseConnection();
  initializeExpress();
};

initializeApp();
