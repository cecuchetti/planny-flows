import { Request, Response } from 'express';
import { dataSource } from 'database/createConnection';
import { isJiraIntegrationsConfigured } from 'config';
import { logger } from 'utils/logger';

interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'unhealthy';
  details?: string;
}

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const checks: HealthCheckResult[] = [];
  let isHealthy = true;

  const dbCheck: HealthCheckResult = {
    name: 'database',
    status: 'healthy',
  };

  try {
    if (dataSource.isInitialized) {
      await dataSource.query('SELECT 1');
    } else {
      dbCheck.status = 'unhealthy';
      dbCheck.details = 'Database connection not initialized';
      isHealthy = false;
    }
  } catch (error) {
    dbCheck.status = 'unhealthy';
    dbCheck.details = error instanceof Error ? error.message : 'Unknown database error';
    isHealthy = false;
    logger.error({ error: error instanceof Error ? error.message : error }, 'Health check: database error');
  }

  checks.push(dbCheck);

  const jiraCheck: HealthCheckResult = {
    name: 'jira-integrations',
    status: isJiraIntegrationsConfigured() ? 'healthy' : 'unhealthy',
    details: isJiraIntegrationsConfigured() 
      ? undefined 
      : 'Jira integration not configured',
  };
  checks.push(jiraCheck);

  const response = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks,
  };

  res.status(isHealthy ? 200 : 503).json(response);
}

export async function readinessCheck(_req: Request, res: Response): Promise<void> {
  try {
    if (!dataSource.isInitialized) {
      res.status(503).json({ status: 'not_ready', reason: 'Database not initialized' });
      return;
    }

    await dataSource.query('SELECT 1');
    
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Readiness check failed');
    res.status(503).json({ 
      status: 'not_ready', 
      reason: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

export async function livenessCheck(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
}
