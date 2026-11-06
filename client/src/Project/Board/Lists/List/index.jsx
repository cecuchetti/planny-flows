import React from 'react';
import PropTypes from 'prop-types';
import { Droppable } from '@hello-pangea/dnd';
import intersection from 'lodash/intersection';
import { useTranslation } from 'react-i18next';

import { IssueStatus } from 'shared/constants/issues';
import Issue from './Issue';

const propTypes = {
  status: PropTypes.string.isRequired,
  project: PropTypes.object.isRequired,
  filters: PropTypes.object.isRequired,
  currentUserId: PropTypes.number,
  columnDragHandleProps: PropTypes.object,
};

function ProjectBoardList({
  status,
  project,
  filters,
  currentUserId = null,
  columnDragHandleProps = null,
}) {
  const { t } = useTranslation();
  const filteredIssues = filterIssues(project.issues, filters, currentUserId);
  const filteredListIssues = getSortedListIssues(filteredIssues, status);
  const allListIssues = getSortedListIssues(project.issues, status);

  const isFullWidth = !!columnDragHandleProps;

  return (
    <Droppable key={status} droppableId={status}>
      {(provided, snapshot) => (
        <div
          className={`flex flex-col bg-surface-container-low/70 rounded-2xl p-3 min-h-[640px] ${isFullWidth ? 'w-full' : 'w-full'}`}
        >
          <div {...columnDragHandleProps} className="flex items-center justify-between pb-3 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-headline-md text-headline-md text-on-surface truncate min-w-0">
                {t(`issueStatuses.${status}`)}
              </span>
              {renderBadge(allListIssues, filteredListIssues, status)}
            </div>
            <button
              type="button"
              className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">
                {status === IssueStatus.DONE ? 'check' : 'add'}
              </span>
            </button>
          </div>
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            data-testid={`board-list:${status}`}
            className="flex flex-col gap-2.5 h-full px-0.5"
          >
            {filteredListIssues.map((issue, index) => (
              <Issue
                key={issue.id}
                project={project}
                projectUsers={project.users}
                issue={issue}
                index={index}
              />
            ))}
            {snapshot.isDraggingOver ? (
              <div className="w-full h-24 rounded-xl bg-surface-container/60 flex flex-col items-center justify-center gap-1.5 text-primary/70 transition-all">
                <span className="material-symbols-outlined text-[20px] text-primary">
                  drag_indicator
                </span>
                <span className="font-label-md text-label-md font-medium text-primary">
                  {t('board.dropHere')}
                </span>
              </div>
            ) : (
              <div className="min-h-[1px]" data-dnd-placeholder-wrapper>
                {provided.placeholder}
              </div>
            )}
          </div>
        </div>
      )}
    </Droppable>
  );
}

const renderBadge = (allListIssues, filteredListIssues, status) => {
  const countText = formatIssuesCount(allListIssues, filteredListIssues);

  // X of Y format → pill variant
  if (allListIssues.length !== filteredListIssues.length) {
    return (
      <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-code-key text-[11px] font-semibold shrink-0">
        {countText}
      </span>
    );
  }

  // Done status → green variant
  if (status === IssueStatus.DONE) {
    return (
      <span className="min-w-[20px] h-5 px-[5px] rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-code-key text-code-key flex items-center justify-center font-bold shrink-0">
        {countText}
      </span>
    );
  }

  // Plain number → default circle
  return (
    <span className="min-w-[20px] h-5 px-[5px] rounded-full bg-surface-container-high text-on-surface-variant font-code-key text-code-key flex items-center justify-center font-semibold shrink-0">
      {countText}
    </span>
  );
};

const filterIssues = (projectIssues, filters, currentUserId) => {
  const { searchTerm, userIds, myOnly, recent } = filters;
  let issues = projectIssues;

  if (searchTerm) {
    issues = issues.filter((issue) => issue.title.toLowerCase().includes(searchTerm.toLowerCase()));
  }
  if (userIds.length > 0) {
    issues = issues.filter((issue) => intersection(issue.userIds, userIds).length > 0);
  }
  if (myOnly && currentUserId) {
    issues = issues.filter((issue) => issue.userIds.includes(currentUserId));
  }
  if (recent) {
    const threeDaysAgoTimestamp = Date.now() - 3 * 24 * 60 * 60 * 1000;
    issues = issues.filter((issue) => new Date(issue.updatedAt).getTime() > threeDaysAgoTimestamp);
  }
  return issues;
};

const getSortedListIssues = (issues, status) =>
  issues
    .filter((issue) => issue.status === status)
    .sort((a, b) => {
      const aType = a.sourceType || a.source_type;
      const bType = b.sourceType || b.source_type;

      if (aType === 'jira' && bType === 'jira') {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (aDate && bDate && aDate !== bDate) {
          return bDate - aDate;
        }
        return b.id - a.id;
      }
      if (aType === 'jira') return -1;
      if (bType === 'jira') return 1;

      return a.listPosition - b.listPosition;
    });

const formatIssuesCount = (allListIssues, filteredListIssues) => {
  if (allListIssues.length !== filteredListIssues.length) {
    return `${filteredListIssues.length} of ${allListIssues.length}`;
  }
  return allListIssues.length;
};

ProjectBoardList.propTypes = propTypes;

ProjectBoardList.defaultProps = {
  currentUserId: null,
  columnDragHandleProps: null,
};

export default ProjectBoardList;
