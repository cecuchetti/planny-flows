import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { get } from 'lodash';
import { useTranslation } from 'react-i18next';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

import api from 'shared/utils/api';
import { PageLoader, Button } from 'shared/components';
import { Lane, LaneTitle, LaneIssuesCount, LaneContent } from 'shared/components/LaneStyles';
import { jiraStatusColors } from 'shared/utils/styles';
import TimeEntryModal from './TimeEntryModal';

import {
  Page,
  PageHeader,
  PageTitle,
  Card,
  CardKey,
  CardSummary,
  CardMeta,
  CardStatus,
  CardHours,
  LoaderWrap,
  Empty,
  ErrorMessage,
  ColumnsWrap,
} from './Styles';

const JIRA_ISSUES_URL = '/api/v1/jira/issues';
const EXTERNAL_COLUMN_ORDER_KEY = 'jira_clone_external_project_column_order';
const EXTERNAL_ISSUES_CACHE_KEY = 'jira_clone_external_issues_cache';

const loadProjectColumnOrder = () => {
  try {
    const raw = localStorage.getItem(EXTERNAL_COLUMN_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
};

const saveProjectColumnOrder = (order) => {
  try {
    localStorage.setItem(EXTERNAL_COLUMN_ORDER_KEY, JSON.stringify(order));
  } catch (_) { }
};

const loadIssuesFromStorage = () => {
  try {
    const raw = localStorage.getItem(EXTERNAL_ISSUES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) ? parsed : null;
  } catch (_) {
    return null;
  }
};

const saveIssuesToStorage = (data) => {
  try {
    localStorage.setItem(EXTERNAL_ISSUES_CACHE_KEY, JSON.stringify(data));
  } catch (_) { }
};

function getStatusColors(status) {
  if (!status || typeof status !== 'string') return null;
  const key = status.toLowerCase().trim();
  return jiraStatusColors[key] || null;
}

export default function MyJiraIssues() {
  const { t } = useTranslation();
  const [issuesData, setIssuesData] = useState(() => loadIssuesFromStorage());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [timeEntryIssue, setTimeEntryIssue] = useState(null);
  const [projectColumnOrder, setProjectColumnOrder] = useState(() => loadProjectColumnOrder() || []);

  const fetchFromApi = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const issuesRes = await api.get(JIRA_ISSUES_URL, { assignee: 'me', excludeStatus: 'Closed', maxResults: 100 });
      setIssuesData(issuesRes);
      saveIssuesToStorage(issuesRes);
      setHasFetchedOnce(true);
    } catch (err) {
      const message = typeof err === 'string' ? err : (err?.message || t('myJiraIssues.loadError'));
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const cached = loadIssuesFromStorage();
    if (!cached || !(cached.items && cached.items.length)) {
      fetchFromApi();
    } else {
      setHasFetchedOnce(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const issues = get(issuesData, 'items', []) || [];

  const projectKeysToData = useMemo(() => {
    const map = {};
    issues.forEach((issue) => {
      const key = issue.projectKey || 'Other';
      if (!map[key]) map[key] = { projectKey: key, projectName: issue.projectName || key, issues: [] };
      map[key].issues.push(issue);
    });
    return map;
  }, [issues]);

  const issuesByProject = useMemo(() => {
    const data = Object.values(projectKeysToData);
    const saved = Array.isArray(projectColumnOrder) && projectColumnOrder.length > 0 ? projectColumnOrder : null;
    if (saved && saved.length > 0) {
      const ordered = [];
      const keysSet = new Set(data.map((d) => d.projectKey));
      saved.forEach((key) => {
        if (keysSet.has(key)) ordered.push(projectKeysToData[key]);
      });
      data.forEach((d) => {
        if (!saved.includes(d.projectKey)) ordered.push(d);
      });
      return ordered;
    }
    return data.sort((a, b) => (a.projectKey || '').localeCompare(b.projectKey || ''));
  }, [projectKeysToData, projectColumnOrder]);

  const handleColumnDrop = useCallback((result) => {
    if (!result.destination || result.source.droppableId !== 'external-columns') return;
    const keys = issuesByProject.map((p) => p.projectKey);
    const next = [...keys];
    const [removed] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, removed);
    setProjectColumnOrder(next);
    saveProjectColumnOrder(next);
  }, [issuesByProject]);

  useEffect(() => {
    if (issuesByProject.length > 0) {
      const currentKeysSet = new Set(issuesByProject.map((p) => p.projectKey));
      const savedKeysSet = new Set(projectColumnOrder);
      const hasNewProjects = [...currentKeysSet].some((k) => !savedKeysSet.has(k));
      if (hasNewProjects || projectColumnOrder.length === 0) {
        const newOrder = [
          ...projectColumnOrder.filter((k) => currentKeysSet.has(k)),
          ...[...currentKeysSet].filter((k) => !savedKeysSet.has(k)),
        ];
        setProjectColumnOrder(newOrder);
        saveProjectColumnOrder(newOrder);
      }
    }
  }, [issues, projectColumnOrder]);

  const handleTimeEntrySaved = useCallback(() => {
    fetchFromApi();
  }, [fetchFromApi]);

  if (!hasFetchedOnce && isLoading && !(issues && issues.length)) {
    return (
      <Page>
        <LoaderWrap>
          <PageLoader />
        </LoaderWrap>
      </Page>
    );
  }

  if (error && !(issues && issues.length)) {
    return (
      <Page>
        <PageHeader>
          <PageTitle>{t('sidebar.externalAssignments')}</PageTitle>
        </PageHeader>
        <ErrorMessage>{error}</ErrorMessage>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader>
        <PageTitle>{t('sidebar.externalAssignments')}</PageTitle>
        <Button variant="primary" isWorking={isLoading} onClick={fetchFromApi}>
          {t('myJiraIssues.refresh')}
        </Button>
      </PageHeader>

      {timeEntryIssue && (
        <TimeEntryModal
          issue={timeEntryIssue}
          onClose={() => setTimeEntryIssue(null)}
          onSaved={handleTimeEntrySaved}
        />
      )}

      {!(issues && issues.length) ? (
        <Empty>{t('myJiraIssues.empty')}</Empty>
      ) : (
        <DragDropContext onDragEnd={handleColumnDrop}>
          <Droppable droppableId="external-columns" direction="horizontal">
            {(provided) => (
              <ColumnsWrap ref={provided.innerRef} {...provided.droppableProps}>
                {issuesByProject.map(({ projectKey, projectName, issues: projectIssues }, index) => (
                  <Draggable key={projectKey} draggableId={`vcol-${projectKey}`} index={index}>
                    {(colProvided) => (
                      <Lane
                        ref={colProvided.innerRef}
                        {...colProvided.draggableProps}
                        $flexFixed
                        style={{ ...colProvided.draggableProps.style, margin: '0 5px' }}
                      >
                        <LaneTitle {...colProvided.dragHandleProps} $dragHandle>
                          {projectName || projectKey}{' '}
                          <LaneIssuesCount>({projectIssues.length})</LaneIssuesCount>
                        </LaneTitle>
                        <LaneContent>
                          {projectIssues.map((issue) => {
                            return (
                              <Card
                                key={issue.key}
                                as="div"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTimeEntryIssue(issue);
                                }}
                              >
                                <CardKey>{issue.key}</CardKey>
                                <CardSummary title={issue.summary}>{issue.summary}</CardSummary>
                                <CardMeta>
                                  <CardStatus
                                    $bg={getStatusColors(issue.status)?.bg}
                                    $text={getStatusColors(issue.status)?.text}
                                  >
                                    {issue.status}
                                  </CardStatus>
                                  {issue.issueType && <span>{issue.issueType}</span>}
                                </CardMeta>
                              </Card>
                            );
                          })}
                        </LaneContent>
                      </Lane>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </ColumnsWrap>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </Page>
  );
}
