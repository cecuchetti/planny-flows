import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';

import useApi from 'shared/hooks/api';
import { updateArrayItemById } from 'shared/utils/javascript';
import { createQueryParamModalHelpers } from 'shared/utils/queryParamModal';
import { PageLoader, PageError, Modal } from 'shared/components';

import NavbarLeft from './NavbarLeft';
import Sidebar from './Sidebar';
import Board from './Board';
import IssueSearch from './IssueSearch';
import IssueCreate from './IssueCreate';
import ProjectSettings from './ProjectSettings';
import MyJiraIssues from './MyJiraIssues';
import { ProjectPage } from './Styles';

const Project = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const match = { path: '/project', url: location.pathname };

  const issueSearchModalHelpers = createQueryParamModalHelpers(
    'issue-search',
    navigate,
    location,
  );
  const issueCreateModalHelpers = createQueryParamModalHelpers(
    'issue-create',
    navigate,
    location,
  );

  const [{ data, error, setLocalData }, fetchProject] = useApi.get('/project');

  if (!data) return <PageLoader />;
  if (error) return <PageError />;

  const { project } = data;

  const updateLocalProjectIssues = (issueId, updatedFields) => {
    setLocalData(currentData => ({
      project: {
        ...currentData.project,
        issues: updateArrayItemById(currentData.project.issues, issueId, updatedFields),
      },
    }));
  };

  return (
    <ProjectPage>
      <NavbarLeft
        issueSearchModalOpen={issueSearchModalHelpers.open}
        issueCreateModalOpen={issueCreateModalHelpers.open}
      />

      <Sidebar project={project} />

      {issueSearchModalHelpers.isOpen() && (
        <Modal
          isOpen
          testid="modal:issue-search"
          variant="aside"
          width={600}
          onClose={issueSearchModalHelpers.close}
          renderContent={() => <IssueSearch project={project} />}
        />
      )}

      {issueCreateModalHelpers.isOpen() && (
        <Modal
          isOpen
          testid="modal:issue-create"
          width={800}
          withCloseIcon={false}
          onClose={issueCreateModalHelpers.close}
          renderContent={modal => (
            <IssueCreate
              project={project}
              fetchProject={fetchProject}
              onCreate={() => navigate(`${match.url}/board`)}
              modalClose={modal.close}
            />
          )}
        />
      )}

      <Routes>
        <Route path="board/*" element={<Board project={project} fetchProject={fetchProject} updateLocalProjectIssues={updateLocalProjectIssues} />} />
        <Route path="my-jira-issues" element={<MyJiraIssues />} />
        <Route path="settings" element={<ProjectSettings project={project} fetchProject={fetchProject} />} />
        <Route index element={<Navigate to="board" replace />} />
      </Routes>
    </ProjectPage>
  );
};

export default Project;
