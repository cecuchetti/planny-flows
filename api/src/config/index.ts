const getEnv = (key: string, defaultValue?: string): string | undefined =>
  process.env[key] ?? defaultValue;

export const appConfig = {
  env: getEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  port: Number(getEnv('PORT', '3000')),
  clientUrl: getEnv('CLIENT_URL', 'http://localhost:8080')!,
  jwt: {
    secret: getEnv('JWT_SECRET', 'jira-clone-dev-secret')!,
    expiresIn: getEnv('JWT_EXPIRES_IN', '180 days')!,
  },
  db: {
    type: getEnv('DB_TYPE', 'postgres') as 'postgres' | 'sqlite',
    host: getEnv('DB_HOST', 'localhost')!,
    port: Number(getEnv('DB_PORT', '5432')),
    username: getEnv('DB_USERNAME', 'postgres')!,
    password: getEnv('DB_PASSWORD', '')!,
    database: getEnv('DB_DATABASE', 'jira_clone')!,
    path: getEnv('DB_PATH', 'data/jira.sqlite')!,
  },
  jira: {
    app: {
      defaultTimezone: getEnv('APP_DEFAULT_TIMEZONE', 'America/New_York')!,
    },
    internal: {
      atlassianBaseUrl: getEnv('INTERNAL_ATLASSIAN_BASE_URL') || '',
      jiraAuthType: (getEnv('INTERNAL_JIRA_AUTH_TYPE') || 'basic') as 'basic' | 'bearer',
      jiraEmail: getEnv('INTERNAL_JIRA_EMAIL'),
      jiraApiToken: getEnv('INTERNAL_JIRA_API_TOKEN'),
      jiraFixedIssueKey: getEnv('INTERNAL_JIRA_FIXED_ISSUE_KEY', 'VIS-2'),
    },
    external: {
      atlassianBaseUrl: getEnv('EXTERNAL_ATLASSIAN_BASE_URL') || '',
      jiraAuthType: (getEnv('EXTERNAL_JIRA_AUTH_TYPE') || 'basic') as 'basic' | 'bearer',
      jiraEmail: getEnv('EXTERNAL_JIRA_EMAIL'),
      jiraApiToken: getEnv('EXTERNAL_JIRA_API_TOKEN'),
      myAccountId: getEnv('EXTERNAL_MY_ACCOUNT_ID'),
    },
    http: {
      connectTimeoutMs: Number(getEnv('HTTP_CONNECT_TIMEOUT_MS', '5000')),
      readTimeoutMs: Number(getEnv('HTTP_READ_TIMEOUT_MS', '10000')),
    },
  },
  maintenance: {
    outlookCleaner: {
      url: getEnv('OUTLOOK_CLEANER_URL', 'https://outlook-cleaner.fly.dev/api/v1/trigger-clean')!,
      apiKey: getEnv('OUTLOOK_CLEANER_API_KEY') || '',
    },
    workdayHours: Number(getEnv('MAINTENANCE_WORKDAY_HOURS', '8')),
    // Worklog start time in HH:mm format (UTC). Default: 19:30 UTC = 4:30 PM Argentina time (UTC-3)
    worklogStartTime: getEnv('MAINTENANCE_WORKLOG_START_TIME', '19:30')!,
    // Default description for worklogs when none provided. Use {issueKey} as placeholder.
    worklogDefaultDescription: getEnv('MAINTENANCE_WORKLOG_DEFAULT_DESCRIPTION', 'Working on issue {issueKey}')!,
  },
};

export function isProduction(): boolean {
  return appConfig.env === 'production';
}

export function isDevelopment(): boolean {
  return appConfig.env === 'development';
}

export function validateConfig(): void {
  const errors: string[] = [];

  if (!appConfig.jwt.secret) {
    errors.push('JWT_SECRET is required');
  }

  if (appConfig.db.type === 'postgres') {
    if (!appConfig.db.host) errors.push('DB_HOST is required for postgres');
    if (!appConfig.db.database) errors.push('DB_DATABASE is required for postgres');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

export function isJiraIntegrationsConfigured(): boolean {
  return !!(
    appConfig.jira.internal.atlassianBaseUrl &&
    appConfig.jira.external.atlassianBaseUrl &&
    (appConfig.jira.internal.jiraApiToken || appConfig.jira.external.jiraApiToken)
  );
}
