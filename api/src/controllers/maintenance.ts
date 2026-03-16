import { Request, Response } from 'express';
import axios from 'axios';
import { appConfig } from 'config';
import { logger } from 'utils/logger';
import { WorklogTarget } from '../jira-integrations/domain/types';
import { WorklogService } from '../jira-integrations/services/worklogService';
import { JiraWorklogClient } from '../jira-integrations/integrations/jiraWorklogClient';
import { getJiraInstanceConfig, getWorklogInstanceNames } from '../jira-integrations/config/instances';

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

/**
 * POST /maintenance/actions/tempo-export
 * Creates a Tempo worklog for VIS-2 ticket on the internal Jira instance.
 */
export async function exportToTempo(req: Request, res: Response): Promise<void> {
  const { startDate, durationMinutes, taskKey, description } = req.body;
  
  // Validation: Required fields
  if (!startDate || !durationMinutes) {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'startDate and durationMinutes are required',
      },
    });
    return;
  }
  
  // Validation: durationMinutes must be positive
  if (typeof durationMinutes !== 'number' || durationMinutes <= 0) {
    res.status(400).json({
      error: {
        code: 'INVALID_DURATION',
        message: 'durationMinutes must be a positive number',
      },
    });
    return;
  }
  
  // Validation: taskKey must be VIS-2 (internal restriction)
  if (taskKey && taskKey !== 'VIS-2') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Only VIS-2 task is allowed for Tempo export',
      },
    });
    return;
  }
  
  try {
    const worklogService = new WorklogService();
    
    // Extract date part if startDate is an ISO datetime string
    const workDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
    
    // Get configurable worklog start time (default: 19:30 UTC = 4:30 PM Argentina time)
    const worklogStartTime = appConfig.maintenance.worklogStartTime;
    // Parse the time (format: HH:mm) and validate
    const timeParts = worklogStartTime.split(':');
    if (timeParts.length !== 2) {
      res.status(500).json({
        error: {
          code: 'CONFIG_ERROR',
          message: 'Invalid MAINTENANCE_WORKLOG_START_TIME format. Expected HH:mm',
        },
      });
      return;
    }
    const [hours, minutes] = timeParts;
    const startedAt = `${workDate}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00Z`;
    
    // Determine the issue key (hardcoded to VIS-2 for internal Tempo)
    const issueKey = 'VIS-2';
    
    // Build description: use provided description or configurable default with {issueKey} placeholder
    const finalDescription = description && description.trim() 
      ? description.trim() 
      : appConfig.maintenance.worklogDefaultDescription.replace('{issueKey}', issueKey);
    
    // Create worklog for internal Tempo (VIS-2)
    const result = await worklogService.createWorklog({
      target: WorklogTarget.TEMPO, // Only internal Tempo
      workDate,
      startedAt, // Configurable start time (default: 19:30 UTC)
      timeSpentSeconds: durationMinutes * 60, // Convert minutes to seconds
      description: finalDescription,
    });
    
    if (result.overallStatus === 'SUCCESS') {
      res.status(200).json({
        success: true,
        message: 'Tempo worklog created successfully',
        requestId: result.requestId,
      });
    } else {
      res.status(500).json({
        error: {
          code: 'TEMPO_EXPORT_FAILED',
          message: 'Failed to create Tempo worklog',
          details: result.results,
        },
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error({ error: err.message, stack: err.stack }, 'Tempo export failed');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message,
      },
    });
  }
}

/**
 * GET /maintenance/actions/tempo-export/hours
 * Returns the total hours logged for VIS-2 on a specific date (fetched from Tempo API).
 */
export async function getHoursLogged(req: Request, res: Response): Promise<void> {
  const { date } = req.query;

  if (!date || typeof date !== 'string') {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Date query parameter is required (YYYY-MM-DD format)',
      },
    });
    return;
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    res.status(400).json({
      error: {
        code: 'INVALID_DATE_FORMAT',
        message: 'Date must be in YYYY-MM-DD format',
      },
    });
    return;
  }

  // Validate date is semantically correct (e.g., reject 2026-02-30)
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    res.status(400).json({
      error: {
        code: 'INVALID_DATE',
        message: 'Date is not valid',
      },
    });
    return;
  }

  try {
    const { internal } = getWorklogInstanceNames();
    const internalConfig = getJiraInstanceConfig(internal);
    const client = new JiraWorklogClient(internalConfig);
    const issueKey = internalConfig.fixedIssueKey ?? 'VIS-2';

    // Fetch worklogs directly from Tempo/Jira API
    // Use fetchAll to ensure we get all worklogs for the issue (Jira API returns max 5000 by default)
    const response = await client.getWorklogs(issueKey, { fetchAll: true });

    // Filter worklogs by date and sum up timeSpentSeconds
    // The 'started' field is in format like "2026-03-16T19:30:00.000+0000"
    const totalSeconds = response.worklogs
      .filter((worklog: { started: string; timeSpentSeconds: number }) => {
        const worklogDate = worklog.started.split('T')[0];
        return worklogDate === date;
      })
      .reduce((sum: number, worklog: { timeSpentSeconds: number }) => sum + worklog.timeSpentSeconds, 0);

    const hoursLogged = totalSeconds / 3600;
    const isComplete = hoursLogged >= appConfig.maintenance.workdayHours;

    res.status(200).json({
      hoursLogged: Math.round(hoursLogged * 100) / 100,
      isComplete,
    });
  } catch (error) {
    const err = error as Error;
    logger.error({ error: err.message, stack: err.stack }, 'Failed to get hours logged from Tempo');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message,
      },
    });
  }
}
