import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { Draggable } from '@hello-pangea/dnd';

import { IssueCard } from 'shared/components';
import { normalizeBoardIssue } from 'shared/adapters/issueAdapters';

const propTypes = {
  project: PropTypes.object.isRequired,
  projectUsers: PropTypes.array.isRequired,
  issue: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
};

function ProjectBoardListIssue({ project, projectUsers, issue, index }) {
  const location = useLocation();
  const boardUrl = location.pathname.replace(/\/issues\/[^/]+$/, '') || location.pathname;

  // Normalize board issue for unified IssueCard component
  const normalizedIssue = useMemo(() =>
    normalizeBoardIssue(issue, project, projectUsers, boardUrl),
    [issue, project, projectUsers, boardUrl]
  );

  return (
    <Draggable draggableId={issue.id.toString()} index={index}>
      {(provided, snapshot) => (
        <IssueCard
          ref={provided.innerRef}
          issue={normalizedIssue}
          isBeingDragged={snapshot.isDragging && !snapshot.isDropAnimating}
          data-testid="list-issue"
          {...provided.draggableProps}
          {...provided.dragHandleProps}
        />
      )}
    </Draggable>
  );
}

ProjectBoardListIssue.propTypes = propTypes;

export default ProjectBoardListIssue;
