import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { get } from 'lodash';
import { useTranslation } from 'react-i18next';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

import api from 'shared/utils/api';
import { moveItemWithinArray } from 'shared/utils/javascript';
import { PageLoader, Button, IssueCard } from 'shared/components';
import { Lane, LaneTitle, LaneIssuesCount, LaneContent } from 'shared/components/LaneStyles';

import { normalizeJiraIssue } from 'shared/adapters/issueAdapters';
import TimeEntryModal from './TimeEntryModal';
import HoursByDateModal from './HoursByDateModal';

import {
  Page,
  PageHeader,
  PageTitle,
  LoaderWrap,
  Empty,
  ErrorMessage,
  ColumnsWrap,
} from './Styles';

const JIRA_ISSUES_URL = '/api/v1/jira/issues';
const WORKLOGS_HOURS_BY_DATE_URL = '/api/v1/jira/worklogs/hours-by-date';
const EXTERNAL_COLUMN_ORDER_KEY = 'jira_clone_external_project_column_order';
const EXTERNAL_ISSUES_CACHE_KEY = 'jira_clone_external_issues_cache';
const EXTERNAL_ISSUE_ORDER_KEY = 'jira_clone_external_issue_order';
const MY_ATLASSIAN_AVATAR_URL =
  'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/557058:0737dc23-6a5c-419a-8115-e15ab83e32df/73e6ddb1-5ec6-4fc7-9a12-141026676fa0/128';

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
  } catch (_) { /* ignore */ }
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
  } catch (_) { /* ignore */ }
};

const loadIssueOrder = () => {
  try {
    const raw = localStorage.getItem(EXTERNAL_ISSUE_ORDER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (_) {
    return {};
  }
};

const saveIssueOrder = (order) => {
  try {
    localStorage.setItem(EXTERNAL_ISSUE_ORDER_KEY, JSON.stringify(order));
  } catch (_) { /* ignore */ }
};



export default function MyJiraIssues() {
  const { t } = useTranslation();
  const [issuesData, setIssuesData] = useState(() => loadIssuesFromStorage());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [timeEntryIssue, setTimeEntryIssue] = useState(null);
  const [projectColumnOrder, setProjectColumnOrder] = useState(() => loadProjectColumnOrder() || []);
  const [issueOrder, setIssueOrder] = useState(() => loadIssueOrder());
  const [hoursTodaySeconds, setHoursTodaySeconds] = useState(null);
  const [showHoursModal, setShowHoursModal] = useState(false);

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

  const issues = useMemo(() => get(issuesData, 'items', []) || [], [issuesData]);

  const projectKeysToData = useMemo(() => {
    const map = {};
    issues.forEach((issue) => {
      const key = issue.projectKey || 'Other';
      if (!map[key]) map[key] = { projectKey: key, projectName: issue.projectName || key, issues: [] };
      map[key].issues.push(issue);
    });
    return map;
  }, [issues]);

  const sortIssuesByOrder = useCallback((issueList, projectKey) => {
    const order = issueOrder[projectKey];
    if (!Array.isArray(order) || order.length === 0) return issueList;
    
    const issueMap = Object.fromEntries(issueList.map(issue => [issue.key, issue]));
    const sorted = [];
    // Add issues in stored order
    order.forEach(key => {
      if (issueMap[key]) {
        sorted.push(issueMap[key]);
        delete issueMap[key];
      }
    });
    // Append remaining issues (new ones) at the end
    Object.values(issueMap).forEach(issue => {
      sorted.push(issue);
    });
    return sorted;
  }, [issueOrder]);

  const sortedProjectGroups = useMemo(() => {
    const map = {};
    Object.keys(projectKeysToData).forEach((projectKey) => {
      const group = projectKeysToData[projectKey];
      map[projectKey] = {
        ...group,
        issues: sortIssuesByOrder(group.issues, projectKey),
      };
    });
    return map;
  }, [projectKeysToData, sortIssuesByOrder]);

  const issuesByProject = useMemo(() => {
    const data = Object.values(sortedProjectGroups);
    const saved = Array.isArray(projectColumnOrder) && projectColumnOrder.length > 0 ? projectColumnOrder : null;
    if (saved && saved.length > 0) {
      const ordered = [];
      const keysSet = new Set(data.map((d) => d.projectKey));
      saved.forEach((key) => {
        if (keysSet.has(key)) ordered.push(sortedProjectGroups[key]);
      });
      data.forEach((d) => {
        if (!saved.includes(d.projectKey)) ordered.push(d);
      });
      return ordered;
    }
    return data.sort((a, b) => (a.projectKey || '').localeCompare(b.projectKey || ''));
  }, [sortedProjectGroups, projectColumnOrder]);

  const handleColumnDrop = useCallback((result) => {
    if (!result.destination || result.source.droppableId !== 'external-columns') return;
    const keys = issuesByProject.map((p) => p.projectKey);
    const next = [...keys];
    const [removed] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, removed);
    setProjectColumnOrder(next);
    saveProjectColumnOrder(next);
  }, [issuesByProject]);

  const handleCardDrop = useCallback((result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    // Only allow reordering within same project
    if (source.droppableId !== destination.droppableId) return;
    // No change in position
    if (source.index === destination.index) return;

    const projectKey = source.droppableId.replace(/^project-/, '');
    const currentOrder = sortedProjectGroups[projectKey]?.issues.map(issue => issue.key) || [];
    const newOrder = moveItemWithinArray(currentOrder, draggableId, destination.index);
    
    const updatedOrder = {
      ...issueOrder,
      [projectKey]: newOrder,
    };
    setIssueOrder(updatedOrder);
    saveIssueOrder(updatedOrder);
  }, [issueOrder, sortedProjectGroups]);

  const onDragEnd = useCallback((result) => {
    if (result.source.droppableId === 'external-columns') {
      handleColumnDrop(result);
    } else {
      handleCardDrop(result);
    }
  }, [handleColumnDrop, handleCardDrop]);

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
  }, [issues, projectColumnOrder, issuesByProject]);

  const fetchHoursToday = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await api.get(WORKLOGS_HOURS_BY_DATE_URL, { from: today, to: today });
      const list = res.items || [];
      const row = list.find((r) => r.workDate === today);
      setHoursTodaySeconds(row ? row.totalSeconds : 0);
    } catch (_) {
      setHoursTodaySeconds(0);
    }
  }, []);

  useEffect(() => {
    fetchHoursToday();
  }, [fetchHoursToday]);

  const handleTimeEntrySaved = useCallback(() => {
    fetchFromApi();
    fetchHoursToday();
  }, [fetchFromApi, fetchHoursToday]);

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

  const hoursTodayDisplay =
    hoursTodaySeconds != null
      ? t('myJiraIssues.hoursTodayValue', {
          hours: hoursTodaySeconds === 0 ? '0' : (hoursTodaySeconds / 3600).toFixed(2).replace(/\.?0+$/, ''),
        })
      : '';

  return (
    <Page>
      <PageHeader>
        <PageTitle>{t('sidebar.externalAssignments')}</PageTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {hoursTodayDisplay !== '' && (
            <button
              type="button"
              onClick={() => setShowHoursModal(true)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #c4b5fd',
                background: '#f5f3ff',
                color: '#6d28d9',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
              }}
              title={t('myJiraIssues.hoursToday')}
            >
              {t('myJiraIssues.hoursToday')}: {hoursTodayDisplay}
            </button>
          )}
          <Button variant="primary" isWorking={isLoading} onClick={fetchFromApi}>
            {t('myJiraIssues.refresh')}
          </Button>
        </div>
      </PageHeader>

      {showHoursModal && (
        <HoursByDateModal
          isOpen={showHoursModal}
          onClose={() => setShowHoursModal(false)}
          onSaved={fetchHoursToday}
        />
      )}

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
        <DragDropContext onDragEnd={onDragEnd}>
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
                          <LaneIssuesCount>{projectIssues.length}</LaneIssuesCount>
                        </LaneTitle>
                        <LaneContent>
                          <Droppable droppableId={`project-${projectKey}`} direction="vertical">
                            {(droppableProvided) => (
                              <div ref={droppableProvided.innerRef} {...droppableProvided.droppableProps}>
                           {projectIssues.map((issue, issueIndex) => {
                            // Add fallback for avatar and display name
                            const issueWithFallback = {
                              ...issue,
                              assigneeAvatarUrl: issue.assigneeAvatarUrl || MY_ATLASSIAN_AVATAR_URL,
                              assigneeDisplayName: issue.assigneeDisplayName || 'Me',
                            };

                            // Create click handler for time entry modal
                            const handleClick = (e) => {
                              e.stopPropagation();
                              setTimeEntryIssue(issue);
                            };

                            // Normalize issue for unified IssueCard
                            const normalizedIssue = normalizeJiraIssue(issueWithFallback, handleClick);

                            return (
                               <Draggable key={issue.key} draggableId={issue.key} index={issueIndex}>
                                {(draggableProvided, snapshot) => (
                                  <IssueCard
                                    ref={draggableProvided.innerRef}
                                    issue={normalizedIssue}
                                    isBeingDragged={snapshot.isDragging && !snapshot.isDropAnimating}
                                    {...draggableProvided.draggableProps}
                                    {...draggableProvided.dragHandleProps}
                                  />
                                )}
                              </Draggable>
                            );
                          })}
                          {droppableProvided.placeholder}
                        </div>
                      )}
                    </Droppable>
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
