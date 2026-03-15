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
    SANTEX_ATLASSIAN_BASE_URL?: string;
    SANTEX_JIRA_AUTH_TYPE?: 'basic' | 'bearer';
    SANTEX_JIRA_EMAIL?: string;
    SANTEX_JIRA_API_TOKEN?: string;
    SANTEX_JIRA_FIXED_ISSUE_KEY?: string;
    VISTAGE_ATLASSIAN_BASE_URL?: string;
    VISTAGE_JIRA_AUTH_TYPE?: 'basic' | 'bearer';
    VISTAGE_JIRA_EMAIL?: string;
    VISTAGE_JIRA_API_TOKEN?: string;
    VISTAGE_MY_ACCOUNT_ID?: string;
    HTTP_CONNECT_TIMEOUT_MS?: string;
    HTTP_READ_TIMEOUT_MS?: string;
  }
}
