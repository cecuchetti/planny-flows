import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import useMergeState from 'shared/hooks/mergeState';
import { Breadcrumbs, Modal } from 'shared/components';

import Header from './Header';
import Filters from './Filters';
import ProjectFilter from './Filters/ProjectFilter';
import Lists from './Lists';
import IssueDetails from './IssueDetails';
import { SelectAtLeastOne } from './Styles';

const propTypes = {
  project: PropTypes.object.isRequired,
  fetchProject: PropTypes.func.isRequired,
  updateLocalProjectIssues: PropTypes.func.isRequired,
  projects: PropTypes.array,
  selectedProjectIds: PropTypes.array,
  onProjectFilterChange: PropTypes.func,
};

const defaultProps = {
  projects: [],
  selectedProjectIds: [],
  onProjectFilterChange: null,
};

const defaultFilters = {
  searchTerm: '',
  userIds: [],
  myOnly: false,
  recent: false,
};

function IssueDetailsModal({ project, fetchProject, updateLocalProjectIssues }) {
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
}

function ProjectBoard({
  project,
  fetchProject,
  updateLocalProjectIssues,
  projects,
  selectedProjectIds,
  onProjectFilterChange,
}) {
  const { t } = useTranslation();
  const [filters, mergeFilters] = useMergeState(defaultFilters);

  const hasFilter = !!(
    projects &&
    selectedProjectIds &&
    onProjectFilterChange
  );

  const projectName = project.name || t('board.allProjects');

  return (
    <Fragment>
      <Breadcrumbs items={[t('board.projects'), projectName, t('board.kanbanBoard')]} />
      <Header />
      {hasFilter && (
        <ProjectFilter
          projects={projects}
          selectedIds={selectedProjectIds}
          onChange={onProjectFilterChange}
        />
      )}
      <Filters
        projectUsers={project.users}
        defaultFilters={defaultFilters}
        filters={filters}
        mergeFilters={mergeFilters}
      />
      {selectedProjectIds && selectedProjectIds.length === 0 ? (
        <SelectAtLeastOne>{t('board.selectAtLeastOneProject')}</SelectAtLeastOne>
      ) : (
        <Lists
          project={project}
          filters={filters}
          updateLocalProjectIssues={updateLocalProjectIssues}
        />
      )}
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
ProjectBoard.defaultProps = defaultProps;

export default ProjectBoard;
