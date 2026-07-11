import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import useApi from 'shared/hooks/api';
import { updateArrayItemById } from 'shared/utils/javascript';
import { createQueryParamModalHelpers } from 'shared/utils/queryParamModal';
import { PageLoader, PageError, Modal, Icon } from 'shared/components';

import { ProjectCategoryCopy } from 'shared/constants/projects';

import NavbarLeft from './NavbarLeft';
import Sidebar from './Sidebar';
import IssueSearch from './IssueSearch';
import IssueCreate from './IssueCreate';
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

const Board = lazy(() => import('./Board'));
const QuickActions = lazy(() => import('./QuickActions'));
const ProjectSettings = lazy(() => import('./ProjectSettings'));

const availableDefaultRoutes = ['board', 'my-jira-issues', 'quick-actions', 'settings'];

const getDefaultProjectRoute = () => {
  const configuredRoute = process.env.REACT_APP_DEFAULT_PROJECT_ROUTE;
  return availableDefaultRoutes.includes(configuredRoute) ? configuredRoute : 'board';
};

/**
 * Merge multiple projects into a single synthetic project for the board.
 * Concatenates issues (with projectKey for multi-project prefix) and
 * deduplicates users across projects.
 */
const mergeProjectsIntoOne = (projects) => {
  const allIssues = projects.flatMap((p) =>
    (p.issues || []).map((issue) => ({
      ...issue,
      projectKey: (p.name || '').replace(/\W/g, '').slice(0, 4).toUpperCase(),
    })),
  );

  const allUsers = projects.flatMap((p) => p.users || []);
  const uniqueUsers = [...new Map(allUsers.map((u) => [u.id, u])).values()];

  return {
    ...projects[0],
    id: 0,
    name: 'All Projects',
    issues: allIssues,
    users: uniqueUsers,
  };
};

function Project() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const filterParam = searchParams.get('filter');
  const initialFilterApplied = useRef(false);
  const match = { path: '/project', url: location.pathname };

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const issueSearchModalHelpers = createQueryParamModalHelpers('issue-search', navigate, location);
  const issueCreateModalHelpers = createQueryParamModalHelpers('issue-create', navigate, location);

  // ── Project list (for filter chips) ──────────────────────────────────────
  const [{ data: projectsData }] = useApi.get('/projects');

  // ── Board data (lazy — fetched on demand with optional ?ids= param) ──────
  const [{ data, error, setLocalData }, fetchBoardData] = useApi.get(
    '/project',
    {},
    { lazy: true },
  );

  // ── Selected project IDs (persisted in localStorage) ─────────────────────
  const [selectedProjectIds, setSelectedProjectIds] = useState(() => {
    try {
      const stored = localStorage.getItem('planny-selected-project-ids');
      return stored ? JSON.parse(stored) : null; // null = initializing / all
    } catch {
      return null;
    }
  });

  // ── Effect: initialize + fetch board data ────────────────────────────────
  useEffect(() => {
    const projectList = projectsData?.projects;

    // Still loading the project list
    if (!projectList) return;

    // ── Initial filter override from URL query param (takes precedence over localStorage) ──
    if (filterParam && !initialFilterApplied.current) {
      initialFilterApplied.current = true;
      if (filterParam === 'jira') {
        setSelectedProjectIds(
          projectList.filter((p) => (p.source_type || p.sourceType) === 'jira').map((p) => p.id),
        );
      } else if (filterParam === 'local') {
        setSelectedProjectIds(
          projectList.filter((p) => (p.source_type || p.sourceType) !== 'jira').map((p) => p.id),
        );
      } else {
        // 'all' or unknown filter — select all projects
        setSelectedProjectIds(projectList.map((p) => p.id));
      }
      return; // will re-trigger effect with the ids, without persisting to localStorage
    }

    // No projects — fall back to single-project (backward compat)
    if (projectList.length === 0 && selectedProjectIds === null) {
      fetchBoardData();
      return;
    }

    // Has projects but ids not yet initialized — set to all
    if (projectList.length > 0 && selectedProjectIds === null) {
      setSelectedProjectIds(projectList.map((p) => p.id));
      return; // will re-trigger effect with the new ids
    }

    // Fetch board data for selected projects
    if (selectedProjectIds !== null) {
      if (selectedProjectIds.length > 0) {
        fetchBoardData({ ids: selectedProjectIds.join(',') });
      } else {
        // Zero projects selected — show empty board
        setLocalData(() => ({ projects: [] }));
      }
    }
  }, [projectsData, selectedProjectIds, fetchBoardData, setLocalData, filterParam]);

  // ── Persist selection changes ────────────────────────────────────────────
  const handleProjectFilterChange = useCallback((newIds) => {
    setSelectedProjectIds(newIds);
    try {
      localStorage.setItem('planny-selected-project-ids', JSON.stringify(newIds));
    } catch (_) {
      // localStorage unavailable — silently ignore
    }
  }, []);

  // ── Refetch wrapper (backward compat for IssueCreate / ProjectSettings) ──
  const fetchProject = useCallback(() => {
    if (selectedProjectIds && selectedProjectIds.length > 0) {
      fetchBoardData({ ids: selectedProjectIds.join(',') });
    } else {
      fetchBoardData();
    }
  }, [selectedProjectIds, fetchBoardData]);

  // ── Normalize projects list for filter chips ────────────────────────────
  const projects = useMemo(
    () =>
      (projectsData?.projects || []).map((p) => ({
        id: p.id,
        name: p.name,
        sourceType: p.sourceType || p.source_type,
      })),
    [projectsData],
  );

  // ── Merge multi-project data into a synthetic project for Board ──────────
  const normalizedProject = useMemo(() => {
    if (!data) return null;

    // Backward compat: single-project response
    if (data.project) return data.project;

    // Multi-project response
    if (data.projects && data.projects.length > 0) {
      return mergeProjectsIntoOne(data.projects);
    }

    // Empty (zero projects selected)
    return { id: 0, name: '', users: [], issues: [] };
  }, [data]);

  if (!normalizedProject) return <PageLoader />;
  if (error) return <PageError />;

  const project = normalizedProject;

  const updateLocalProjectIssues = (issueId, updatedFields) => {
    setLocalData((currentData) => {
      if (!currentData) return currentData;

      // Multi-project: find the issue in whichever project it belongs to
      if (currentData.projects) {
        return {
          projects: currentData.projects.map((p) => ({
            ...p,
            issues: updateArrayItemById(p.issues || [], issueId, updatedFields),
          })),
        };
      }

      // Backward compat: single project
      if (currentData.project) {
        return {
          project: {
            ...currentData.project,
            issues: updateArrayItemById(currentData.project.issues, issueId, updatedFields),
          },
        };
      }

      return currentData;
    });
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

          {isMobileMenuOpen && <MobileDrawerBackdrop onClick={() => setIsMobileMenuOpen(false)} />}

          <MobileDrawer $isOpen={isMobileMenuOpen}>
            <MobileActions>
              <MobileActionButton
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  issueSearchModalHelpers.open();
                }}
              >
                <Icon type="search" size={18} />
                {t('nav.searchIssues')}
              </MobileActionButton>
              <MobileActionButton
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  issueCreateModalHelpers.open();
                }}
              >
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
                renderContent={(modal) => (
                  <IssueCreate
                    project={project}
                    fetchProject={fetchProject}
                    onCreate={() => navigate(`${match.url}/board`)}
                    modalClose={modal.close}
                  />
                )}
              />
            )}

            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route
                  path="board/*"
                  element={
                    <Board
                      project={project}
                      fetchProject={fetchProject}
                      updateLocalProjectIssues={updateLocalProjectIssues}
                      projects={projects}
                      selectedProjectIds={selectedProjectIds || []}
                      onProjectFilterChange={handleProjectFilterChange}
                    />
                  }
                />
                <Route path="my-jira-issues" element={<Navigate to="/project/board?filter=jira" replace />} />
                <Route path="quick-actions" element={<QuickActions />} />
                <Route
                  path="settings"
                  element={<ProjectSettings project={project} fetchProject={fetchProject} />}
                />
                <Route index element={<Navigate to={getDefaultProjectRoute()} replace />} />
              </Routes>
            </Suspense>
          </MainContent>
        </BodyRow>
      </ContentCard>
    </ProjectPage>
  );
}

export default Project;
