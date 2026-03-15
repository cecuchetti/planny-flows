import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import useMergeState from 'shared/hooks/mergeState';
import { Breadcrumbs, Modal } from 'shared/components';

import Header from './Header';
import Filters from './Filters';
import Lists from './Lists';
import IssueDetails from './IssueDetails';

const propTypes = {
  project: PropTypes.object.isRequired,
  fetchProject: PropTypes.func.isRequired,
  updateLocalProjectIssues: PropTypes.func.isRequired,
};

const defaultFilters = {
  searchTerm: '',
  userIds: [],
  myOnly: false,
  recent: false,
};

const IssueDetailsModal = ({ project, fetchProject, updateLocalProjectIssues }) => {
  const { issueId } = useParams();
  const navigate = useNavigate();
  const boardUrl = '/project/board';

  return (
    <Modal
      isOpen
      testid="modal:issue-details"
      width={1040}
      withCloseIcon={false}
      onClose={() => navigate(boardUrl)}
      renderContent={modal => (
        <IssueDetails
          issueId={issueId}
          projectUsers={project.users}
          fetchProject={fetchProject}
          updateLocalProjectIssues={updateLocalProjectIssues}
          modalClose={modal.close}
        />
      )}
    />
  );
};

const ProjectBoard = ({ project, fetchProject, updateLocalProjectIssues }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [filters, mergeFilters] = useMergeState(defaultFilters);

  return (
    <Fragment>
      <Breadcrumbs items={[t('board.projects'), project.name, t('board.kanbanBoard')]} />
      <Header />
      <Filters
        projectUsers={project.users}
        defaultFilters={defaultFilters}
        filters={filters}
        mergeFilters={mergeFilters}
      />
      <Lists
        project={project}
        filters={filters}
        updateLocalProjectIssues={updateLocalProjectIssues}
      />
      <Routes>
        <Route
          path="issues/:issueId"
          element={
            <IssueDetailsModal
              project={project}
              fetchProject={fetchProject}
              updateLocalProjectIssues={updateLocalProjectIssues}
            />
          }
        />
      </Routes>
    </Fragment>
  );
};

ProjectBoard.propTypes = propTypes;

export default ProjectBoard;
