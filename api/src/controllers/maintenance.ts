import { Request, Response } from 'express';
import axios from 'axios';
import { appConfig } from 'config';
import { logger } from 'utils/logger';

const OUTLOOK_CLEANER_NOT_CONFIGURED = 'OUTLOOK_CLEANER_NOT_CONFIGURED';

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 60000;

type OutlookCleanStatus = 'idle' | 'running' | 'success' | 'failed';

interface LastRun {
  status: 'success' | 'failed';
  at: string;
  message?: string;
}

interface OutlookCleanState {
  status: OutlookCleanStatus;
  lastRun?: LastRun;
}

const outlookCleanState: OutlookCleanState = {
  status: 'idle',
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOutlookCleanerOnce(): Promise<{ ok: boolean; status: number; message?: string }> {
  const { url, apiKey } = appConfig.maintenance.outlookCleaner;
  const response = await axios.post(
    url,
    {},
    {
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: () => true,
    },
  );

  const ok = response.status >= 200 && response.status < 300;
  const message = response.data?.message ?? (ok ? undefined : `HTTP ${response.status}`);
  return { ok, status: response.status, message };
}

async function runOutlookCleanInBackground(): Promise<void> {
  const { apiKey } = appConfig.maintenance.outlookCleaner;
  if (!apiKey) return;

  outlookCleanState.status = 'running';

  let lastError: string | undefined;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    try {
      const result = await callOutlookCleanerOnce();
      if (result.ok) {
        outlookCleanState.status = 'success';
        outlookCleanState.lastRun = {
          status: 'success',
          at: new Date().toISOString(),
          message: result.message,
        };
        logger.info({ attempt }, 'Outlook cleaner completed successfully');
        return;
      }
      lastError = result.message ?? `HTTP ${result.status}`;
      logger.warn({ attempt, maxRetries: MAX_RETRIES, status: result.status }, 'Outlook cleaner attempt failed');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      lastError = msg;
      logger.warn({ attempt, maxRetries: MAX_RETRIES, error: msg }, 'Outlook cleaner request failed');
    }

    if (attempt < MAX_RETRIES) {
      const backoffMs = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      await delay(backoffMs);
    }
  }

  outlookCleanState.status = 'failed';
  outlookCleanState.lastRun = {
    status: 'failed',
    at: new Date().toISOString(),
    message: lastError ?? `Failed after ${MAX_RETRIES} attempts`,
  };
  logger.error({ attempts: MAX_RETRIES }, 'Outlook cleaner failed after all retries');
}

/**
 * POST /maintenance/actions/outlook-clean
 * Accepts the request and runs the Outlook cleaner in the background with 5 retries.
 * Returns 202 Accepted. Use GET .../status to poll for result.
 */
export async function triggerOutlookClean(_req: Request, res: Response): Promise<void> {
  const { apiKey } = appConfig.maintenance.outlookCleaner;

  if (!apiKey) {
    res.status(503).json({
      error: {
        code: OUTLOOK_CLEANER_NOT_CONFIGURED,
        message: 'Outlook cleaner is not configured (OUTLOOK_CLEANER_API_KEY missing).',
      },
    });
    return;
  }

  if (outlookCleanState.status === 'running') {
    res.status(409).json({
      error: {
        code: 'ALREADY_RUNNING',
        message: 'An Outlook clean is already running. Check status or wait for it to finish.',
      },
    });
    return;
  }

  res.status(202).json({
    accepted: true,
    message: 'Outlook clean started. It may take a few minutes. Poll GET /maintenance/actions/outlook-clean/status for the result.',
  });

  runOutlookCleanInBackground().catch((err) => {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Outlook clean background job threw');
    if (outlookCleanState.status === 'running') {
      outlookCleanState.status = 'failed';
      outlookCleanState.lastRun = {
        status: 'failed',
        at: new Date().toISOString(),
        message: err instanceof Error ? err.message : 'Unexpected error',
      };
    }
  });
}

/**
 * GET /maintenance/actions/outlook-clean/status
 * Returns current status: idle | running | success | failed, and last run details if available.
 */
export function getOutlookCleanStatus(_req: Request, res: Response): void {
  const payload: {
    status: OutlookCleanStatus;
    lastRun?: LastRun;
  } = {
    status: outlookCleanState.status,
  };
  if (outlookCleanState.lastRun) {
    payload.lastRun = outlookCleanState.lastRun;
  }
  res.status(200).json(payload);
}
