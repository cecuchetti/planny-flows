import { createProxyMiddleware as httpProxy } from 'http-proxy-middleware';
import type { Request, Response } from 'express';

import { appConfig } from 'config';
import { ExternalServiceError } from 'errors';
import { logger } from 'utils/logger';

// Routes that have been migrated to Python
// Phase 1: health + guest auth
const MIGRATED_PREFIXES: string[] = [
  '/health',
  '/authentication/guest',
  '/',
];

const PYTHON_BACKEND_URL = appConfig.pythonBackendUrl;

export const proxyToPython = httpProxy<Request, Response>({
  target: PYTHON_BACKEND_URL,
  changeOrigin: true,
  // Only proxy requests whose path matches a migrated prefix.
  // When pathFilter returns false, http-proxy-middleware calls next()
  // so Express handles the request normally.
  pathFilter: (pathname, _req) => {
    return MIGRATED_PREFIXES.some((prefix) => {
      // '/': exact match only to avoid catching ALL paths
      if (prefix === '/') return pathname === '/';
      return pathname.startsWith(prefix);
    });
  },
  on: {
    proxyReq: (_proxyReq, req, _res) => {
      logger.debug({ method: req.method, url: req.url }, 'Proxying request to Python backend');
    },
    error: (err, req, res) => {
      // res can be Response or net.Socket (WebSocket upgrades).
      // In Express context, it is always a Response. Narrow type to satisfy TS.
      const expressRes = res as unknown as Response;

      logger.error({ error: err.message }, 'Python backend proxy error');
      const error = new ExternalServiceError('Python backend is unavailable.', 'Python Backend');
      const requestId = req.requestId || `req_${Date.now().toString(36)}`;
      expressRes.status(502).json({
        error: {
          message: error.message,
          code: error.code,
          status: 502,
          data: error.data,
        },
        requestId,
      });
    },
  },
});
