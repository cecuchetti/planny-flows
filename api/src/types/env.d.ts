declare namespace NodeJS {
  export interface ProcessEnv {
    NODE_ENV?: 'development' | 'production' | 'test';
    PORT?: string;
    CLIENT_URL?: string;
    JWT_SECRET: string;
    JWT_EXPIRES_IN?: string;
    DB_TYPE?: 'postgres' | 'sqlite';
    DB_HOST?: string;
    DB_PORT?: string;
    DB_USERNAME?: string;
    DB_PASSWORD?: string;
    DB_DATABASE?: string;
    DB_PATH?: string;
    APP_DEFAULT_TIMEZONE?: string;
    INTERNAL_ATLASSIAN_BASE_URL?: string;
    INTERNAL_JIRA_AUTH_TYPE?: 'basic' | 'bearer';
    INTERNAL_JIRA_EMAIL?: string;
    INTERNAL_JIRA_API_TOKEN?: string;
    INTERNAL_JIRA_FIXED_ISSUE_KEY?: string;
    EXTERNAL_ATLASSIAN_BASE_URL?: string;
    EXTERNAL_JIRA_AUTH_TYPE?: 'basic' | 'bearer';
    EXTERNAL_JIRA_EMAIL?: string;
    EXTERNAL_JIRA_API_TOKEN?: string;
    EXTERNAL_MY_ACCOUNT_ID?: string;
    HTTP_CONNECT_TIMEOUT_MS?: string;
    HTTP_READ_TIMEOUT_MS?: string;
  }
}
