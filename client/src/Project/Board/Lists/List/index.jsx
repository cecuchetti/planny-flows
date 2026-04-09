import React from 'react';
import PropTypes from 'prop-types';
import { Droppable } from '@hello-pangea/dnd';
import intersection from 'lodash/intersection';
import { useTranslation } from 'react-i18next';

import Issue from './Issue';
import { List, Title, IssuesCount, Issues } from './Styles';

const propTypes = {
  status: PropTypes.string.isRequired,
  project: PropTypes.object.isRequired,
  filters: PropTypes.object.isRequired,
  currentUserId: PropTypes.number,
  columnDragHandleProps: PropTypes.object,
};

const ProjectBoardList = ({
  status,
  project,
  filters,
  currentUserId = null,
  columnDragHandleProps = null,
}) => {
  const { t } = useTranslation();
  const filteredIssues = filterIssues(project.issues, filters, currentUserId);
  const filteredListIssues = getSortedListIssues(filteredIssues, status);
  const allListIssues = getSortedListIssues(project.issues, status);

  return (
    <Droppable key={status} droppableId={status}>
      {(provided) => (
        <List $fullWidth={!!columnDragHandleProps}>
          <Title {...columnDragHandleProps}>
            {`${t(`issueStatuses.${status}`)} `}
            <IssuesCount>{formatIssuesCount(allListIssues, filteredListIssues)}</IssuesCount>
          </Title>
          <Issues
            {...provided.droppableProps}
            ref={provided.innerRef}
            data-testid={`board-list:${status}`}
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
            {provided.placeholder}
          </Issues>
        </List>
      )}
    </Droppable>
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
  issues.filter((issue) => issue.status === status).sort((a, b) => a.listPosition - b.listPosition);

const formatIssuesCount = (allListIssues, filteredListIssues) => {
  if (allListIssues.length !== filteredListIssues.length) {
    return `${filteredListIssues.length} of ${allListIssues.length}`;
  }
  return allListIssues.length;
};

ProjectBoardList.propTypes = propTypes;

export default ProjectBoardList;
