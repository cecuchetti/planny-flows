import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { moveItemWithinArray, insertItemIntoArray } from 'shared/utils/javascript';
import { IssueStatus } from 'shared/constants/issues';

import useCurrentUser from 'shared/hooks/currentUser';
import api from 'shared/utils/api';

import List from './List';
import { Lists } from './Styles';

const BOARD_COLUMN_ORDER_KEY = 'jira_clone_board_column_order';

const getDefaultColumnOrder = () => Object.values(IssueStatus);

const loadColumnOrder = () => {
  try {
    const raw = localStorage.getItem(BOARD_COLUMN_ORDER_KEY);
    if (!raw) return getDefaultColumnOrder();
    const parsed = JSON.parse(raw);
    const valid = getDefaultColumnOrder();
    if (Array.isArray(parsed) && parsed.length === valid.length && parsed.every(s => valid.includes(s))) {
      return parsed;
    }
  } catch (_) {}
  return getDefaultColumnOrder();
};

const saveColumnOrder = (order) => {
  try {
    localStorage.setItem(BOARD_COLUMN_ORDER_KEY, JSON.stringify(order));
  } catch (_) {}
};

const propTypes = {
  project: PropTypes.object.isRequired,
  filters: PropTypes.object.isRequired,
  updateLocalProjectIssues: PropTypes.func.isRequired,
};

const ProjectBoardLists = ({ project, filters, updateLocalProjectIssues }) => {
  const { currentUserId } = useCurrentUser();
  const [columnOrder, setColumnOrder] = useState(loadColumnOrder);

  useEffect(() => {
    setColumnOrder(loadColumnOrder());
  }, []);

  const handleColumnDrop = useCallback((result) => {
    if (!result.destination || result.source.droppableId !== 'board-columns') return;
    const next = [...columnOrder];
    const [removed] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, removed);
    setColumnOrder(next);
    saveColumnOrder(next);
  }, [columnOrder]);

  const handleIssueDrop = ({ draggableId, destination, source }) => {
    if (source.droppableId === 'board-columns') return;
    if (!isPositionChanged(source, destination)) return;

    const issueId = Number(draggableId);

    api.optimisticUpdate(`/issues/${issueId}`, {
      updatedFields: {
        status: destination.droppableId,
        listPosition: calculateIssueListPosition(project.issues, destination, source, issueId),
      },
      currentFields: project.issues.find(({ id }) => id === issueId),
      setLocalData: fields => updateLocalProjectIssues(issueId, fields),
    });
  };

  const onDragEnd = (result) => {
    if (result.source.droppableId === 'board-columns') {
      handleColumnDrop(result);
    } else {
      handleIssueDrop(result);
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="board-columns" direction="horizontal">
        {(provided) => (
          <Lists ref={provided.innerRef} {...provided.droppableProps}>
            {columnOrder.map((status, index) => (
              <Draggable key={status} draggableId={`col-${status}`} index={index}>
                {(colProvided) => (
                  <div
                    ref={colProvided.innerRef}
                    {...colProvided.draggableProps}
                    style={{ ...colProvided.draggableProps.style, margin: 0, flex: '0 0 310px', minWidth: '310px' }}
                  >
                    <List
                      status={status}
                      project={project}
                      filters={filters}
                      currentUserId={currentUserId}
                      columnDragHandleProps={colProvided.dragHandleProps}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </Lists>
        )}
      </Droppable>
    </DragDropContext>
  );
};

const isPositionChanged = (destination, source) => {
  if (!destination) return false;
  const isSameList = destination.droppableId === source.droppableId;
  const isSamePosition = destination.index === source.index;
  return !isSameList || !isSamePosition;
};

const calculateIssueListPosition = (...args) => {
  const { prevIssue, nextIssue } = getAfterDropPrevNextIssue(...args);
  let position;

  if (!prevIssue && !nextIssue) {
    position = 1;
  } else if (!prevIssue) {
    position = nextIssue.listPosition - 1;
  } else if (!nextIssue) {
    position = prevIssue.listPosition + 1;
  } else {
    position = prevIssue.listPosition + (nextIssue.listPosition - prevIssue.listPosition) / 2;
  }
  return position;
};

const getAfterDropPrevNextIssue = (allIssues, destination, source, droppedIssueId) => {
  const beforeDropDestinationIssues = getSortedListIssues(allIssues, destination.droppableId);
  const droppedIssue = allIssues.find(issue => issue.id === droppedIssueId);
  const isSameList = destination.droppableId === source.droppableId;

  const afterDropDestinationIssues = isSameList
    ? moveItemWithinArray(beforeDropDestinationIssues, droppedIssue, destination.index)
    : insertItemIntoArray(beforeDropDestinationIssues, droppedIssue, destination.index);

  return {
    prevIssue: afterDropDestinationIssues[destination.index - 1],
    nextIssue: afterDropDestinationIssues[destination.index + 1],
  };
};

const getSortedListIssues = (issues, status) =>
  issues.filter(issue => issue.status === status).sort((a, b) => a.listPosition - b.listPosition);

ProjectBoardLists.propTypes = propTypes;

export default ProjectBoardLists;
