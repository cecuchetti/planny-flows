import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { appConfig } from 'config';
import { HttpClientConfig } from '../integrations/baseClient';

/** Resolves ${VAR} placeholders in a string from process.env */
function resolveEnv(str: string): string {
  return str.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] ?? '');
}

/** Jira instance config used by worklog/issue clients. Extends HTTP config with optional worklog-specific fields. */
export interface JiraInstanceConfig extends HttpClientConfig {
  fixedIssueKey?: string;
  myAccountId?: string;
}

interface YamlInstance {
  name: string;
  atlassianBaseUrl: string;
  authType: 'basic' | 'bearer';
  envPrefix?: string;
  fixedIssueKey?: string;
  myAccountId?: string;
}

interface YamlWorklog {
  internalInstance?: string;
  externalInstance?: string;
}

interface YamlSchema {
  worklog?: YamlWorklog;
  instances?: YamlInstance[];
}

const DEFAULT_WORKLOG_NAMES = { internal: 'internal', external: 'external' };
const DEFAULT_HTTP_TIMEOUT_MS = 5000;

function buildInstanceConfig(
  raw: YamlInstance,
  timeoutMs: number
): JiraInstanceConfig {
  const prefix = raw.envPrefix ?? '';
  const email = process.env[`${prefix}JIRA_EMAIL`];
  const apiToken = process.env[`${prefix}JIRA_API_TOKEN`];
  const baseURL = resolveEnv(raw.atlassianBaseUrl).trim() || '';
  const myAccountIdRaw = raw.myAccountId != null ? resolveEnv(String(raw.myAccountId)) : undefined;
  const myAccountId = myAccountIdRaw?.trim() || undefined;

  return {
    baseURL,
    authType: raw.authType ?? 'basic',
    email: email ?? undefined,
    apiToken: apiToken ?? undefined,
    timeoutMs,
    systemName: `${raw.name}-jira`,
    fixedIssueKey: raw.fixedIssueKey,
    myAccountId: myAccountId || undefined,
  };
}

function loadFromAppConfig(): {
  instances: Map<string, JiraInstanceConfig>;
  worklogNames: { internal: string; external: string };
} {
  const http = appConfig.jira.http;
  const timeoutMs = http?.connectTimeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  const instances = new Map<string, JiraInstanceConfig>();

  const internal = appConfig.jira.internal;
  instances.set('internal', {
    baseURL: internal.atlassianBaseUrl ?? '',
    authType: internal.jiraAuthType ?? 'basic',
    email: internal.jiraEmail ?? undefined,
    apiToken: internal.jiraApiToken ?? undefined,
    timeoutMs,
    systemName: 'internal-jira',
    fixedIssueKey: internal.jiraFixedIssueKey ?? 'VIS-2',
  });

  const external = appConfig.jira.external;
  instances.set('external', {
    baseURL: external.atlassianBaseUrl ?? '',
    authType: external.jiraAuthType ?? 'basic',
    email: external.jiraEmail ?? undefined,
    apiToken: external.jiraApiToken ?? undefined,
    timeoutMs,
    systemName: 'external-jira',
    myAccountId: external.myAccountId ?? undefined,
  });

  return {
    instances,
    worklogNames: DEFAULT_WORKLOG_NAMES,
  };
}

function loadFromYaml(): {
  instances: Map<string, JiraInstanceConfig>;
  worklogNames: { internal: string; external: string };
} | null {
  const yamlPath = path.join(__dirname, 'jira-instances.yaml');
  if (!fs.existsSync(yamlPath)) return null;

  const content = fs.readFileSync(yamlPath, 'utf8');
  const resolved = resolveEnv(content);
  const data = yaml.load(resolved) as YamlSchema | undefined;
  if (!data?.instances?.length) return null;

  const http = appConfig.jira.http;
  const timeoutMs = http?.connectTimeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  const instances = new Map<string, JiraInstanceConfig>();

  for (const raw of data.instances) {
    const config = buildInstanceConfig(raw, timeoutMs);
    instances.set(raw.name, config);
  }

  const worklogNames = {
    internal: data.worklog?.internalInstance ?? DEFAULT_WORKLOG_NAMES.internal,
    external: data.worklog?.externalInstance ?? DEFAULT_WORKLOG_NAMES.external,
  };

  return { instances, worklogNames };
}

let cached: {
  instances: Map<string, JiraInstanceConfig>;
  worklogNames: { internal: string; external: string };
} | null = null;

function getLoaded(): { instances: Map<string, JiraInstanceConfig>; worklogNames: { internal: string; external: string } } {
  if (cached) return cached;
  const fromYaml = loadFromYaml();
  cached = fromYaml ?? loadFromAppConfig();
  return cached;
}

/** Returns the Jira instance config for the given instance name (e.g. "internal", "external"). */
export function getJiraInstanceConfig(instanceName: string): JiraInstanceConfig {
  const { instances } = getLoaded();
  const config = instances.get(instanceName);
  if (!config) {
    throw new Error(`Unknown Jira instance: ${instanceName}. Available: ${[...instances.keys()].join(', ')}`);
  }
  return config;
}

/** Returns all configured instance names. */
export function getAllInstanceNames(): string[] {
  const { instances } = getLoaded();
  return [...instances.keys()];
}

/** Returns the instance names used for worklog internal (Tempo) and external (Jira) legs. */
export function getWorklogInstanceNames(): { internal: string; external: string } {
  return getLoaded().worklogNames;
}

/** Reset cached config (for tests). */
export function resetJiraInstancesCache(): void {
  cached = null;
}
