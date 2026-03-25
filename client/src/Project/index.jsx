import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import useApi from 'shared/hooks/api';
import { updateArrayItemById } from 'shared/utils/javascript';
import { createQueryParamModalHelpers } from 'shared/utils/queryParamModal';
import { PageLoader, PageError, Modal, Icon } from 'shared/components';

import NavbarLeft from './NavbarLeft';
import Sidebar from './Sidebar';
import Board from './Board';
import IssueSearch from './IssueSearch';
import IssueCreate from './IssueCreate';
import ProjectSettings from './ProjectSettings';
import MyJiraIssues from './MyJiraIssues';
import QuickActions from './QuickActions';
import { ProjectCategoryCopy } from 'shared/constants/projects';
import { 
  ProjectPage, 
  ContentCard, 
  TopBar, 
  TopBarAvatar, 
  TopBarTexts, 
  TopBarName, 
  TopBarCategory, 
  BodyRow, 
  MainContent,
  MobileMenuButton,
  MobileMenuIcon,
  MobileDrawer,
  MobileDrawerBackdrop,
  MobileActions,
  MobileActionButton,
  MobileLangSwitcher,
  MobileLangButton,
} from './Styles';

const Project = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const match = { path: '/project', url: location.pathname };

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const handleMobileNavClick = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <ProjectPage>
      <NavbarLeft
        issueSearchModalOpen={issueSearchModalHelpers.open}
        issueCreateModalOpen={issueCreateModalHelpers.open}
      />

      <ContentCard>
        <TopBar>
          <MobileMenuButton onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            <MobileMenuIcon $isOpen={isMobileMenuOpen}>
              <span />
              <span />
              <span />
            </MobileMenuIcon>
          </MobileMenuButton>

          <TopBarAvatar>📌</TopBarAvatar>
          <TopBarTexts>
            <TopBarName>{project.name}</TopBarName>
            <TopBarCategory>{ProjectCategoryCopy[project.category]}</TopBarCategory>
          </TopBarTexts>
        </TopBar>

        <BodyRow>
          <Sidebar project={project} />
          
          {isMobileMenuOpen && (
            <MobileDrawerBackdrop onClick={() => setIsMobileMenuOpen(false)} />
          )}
          
          <MobileDrawer $isOpen={isMobileMenuOpen}>
            <MobileActions>
              <MobileActionButton onClick={() => { setIsMobileMenuOpen(false); issueSearchModalHelpers.open(); }}>
                <Icon type="search" size={18} />
                {t('nav.searchIssues')}
              </MobileActionButton>
              <MobileActionButton onClick={() => { setIsMobileMenuOpen(false); issueCreateModalHelpers.open(); }}>
                <Icon type="plus" size={18} />
                {t('nav.createIssue')}
              </MobileActionButton>
            </MobileActions>
            <Sidebar project={project} onNavClick={handleMobileNavClick} isMobile />
            <MobileLangSwitcher>
              <MobileLangButton
                $active={i18n.language === 'en'}
                onClick={() => i18n.changeLanguage('en')}
              >
                EN
              </MobileLangButton>
              <MobileLangButton
                $active={i18n.language === 'es'}
                onClick={() => i18n.changeLanguage('es')}
              >
                ES
              </MobileLangButton>
            </MobileLangSwitcher>
          </MobileDrawer>

          <MainContent>
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
              <Route path="quick-actions" element={<QuickActions />} />
              <Route path="settings" element={<ProjectSettings project={project} fetchProject={fetchProject} />} />
              <Route index element={<Navigate to="board" replace />} />
            </Routes>
          </MainContent>
        </BodyRow>
      </ContentCard>
    </ProjectPage>
  );
};

export default Project;
