import React from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { Draggable } from '@hello-pangea/dnd';

import { IssueStatusCopy, IssueTypeCopy } from 'shared/constants/issues';
import { issueStatusColors, issueStatusBackgroundColors, issueTypeColors } from 'shared/utils/styles';

import {
  IssueLink,
  Issue,
  PriorityStrip,
  CardBody,
  IssueKey,
  Title,
  BadgeRow,
  StatusBadge,
  Bottom,
  Assignees,
  AssigneeAvatar,
} from './Styles';

const getIssueKey = (project, issueId) => {
  const prefix = project.key || (project.name || '').replace(/\W/g, '').slice(0, 4).toUpperCase() || 'PRJ';
  return `${prefix}-${issueId}`;
};

const issueTypeBackground = {
  task:  '#dbeafe',
  bug:   '#fee2e2',
  story: '#dcfce7',
};

const propTypes = {
  project: PropTypes.object.isRequired,
  projectUsers: PropTypes.array.isRequired,
  issue: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
};

const ProjectBoardListIssue = ({ project, projectUsers, issue, index }) => {
  const location = useLocation();
  const boardUrl = location.pathname.replace(/\/issues\/[^/]+$/, '') || location.pathname;

  const assignees = issue.userIds.map(userId => projectUsers.find(user => user.id === userId)).filter(Boolean);

  const statusBg   = issueStatusBackgroundColors[issue.status];
  const statusText = issueStatusColors[issue.status];
  const typeBg     = issueTypeBackground[issue.type] || '#f3f4f6';
  const typeText   = issueTypeColors[issue.type] || '#374151';

  return (
    <Draggable draggableId={issue.id.toString()} index={index}>
      {(provided, snapshot) => (
        <IssueLink
          to={`${boardUrl}/issues/${issue.id}`}
          ref={provided.innerRef}
          data-testid="list-issue"
          {...provided.draggableProps}
          {...provided.dragHandleProps}
        >
          <Issue $isBeingDragged={snapshot.isDragging && !snapshot.isDropAnimating}>
            <PriorityStrip $priority={Number(issue.priority)} />
            <CardBody>
              <IssueKey>{getIssueKey(project, issue.id)}</IssueKey>
              <Title>{issue.title}</Title>
              <BadgeRow>
                <StatusBadge $bg={statusBg} $text={statusText}>
                  {IssueStatusCopy[issue.status]}
                </StatusBadge>
                <StatusBadge $bg={typeBg} $text={typeText}>
                  {IssueTypeCopy[issue.type]}
                </StatusBadge>
              </BadgeRow>
              <Bottom>
                <Assignees>
                  {assignees.map(user => (
                    <AssigneeAvatar
                      key={user.id}
                      size={22}
                      avatarUrl={user.avatarUrl}
                      name={user.name}
                    />
                  ))}
                </Assignees>
              </Bottom>
            </CardBody>
          </Issue>
        </IssueLink>
      )}
    </Draggable>
  );
};

ProjectBoardListIssue.propTypes = propTypes;

export default ProjectBoardListIssue;
