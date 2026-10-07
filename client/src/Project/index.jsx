import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import useApi from 'shared/hooks/api';
import toast from 'shared/utils/toast';
import { updateArrayItemById } from 'shared/utils/javascript';
import { createQueryParamModalHelpers } from 'shared/utils/queryParamModal';
import { PageLoader, PageError, Modal, Icon } from 'shared/components';

import { ProjectCategoryCopy } from 'shared/constants/projects';

import { filterSelection } from './projectFilter';
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

const availableDefaultRoutes = ['board', 'quick-actions', 'settings'];

/**
 * How long to wait for a scheduled background sync before refetching.
 *
 * Not a completion signal — there is none — just enough for a sync of a few
 * hundred issues to finish. A slower one is picked up by the next poll.
 */
const SYNC_SETTLE_MS = 5000;

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
  /**
   * The filter value already applied to the selection.
   *
   * `null` means "no filter in the URL". Tracking the *value* rather than a
   * one-shot boolean is what makes the board react to every navigation: React
   * Router keeps this component mounted when only the query string changes, so a
   * "have we applied it yet" guard silently ignored every navigation after the
   * first, and /project/board and /project/board?filter=jira showed the same
   * board.
   */
  const appliedFilter = useRef(null);
  const match = { path: '/project', url: location.pathname };

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const issueSearchModalHelpers = createQueryParamModalHelpers('issue-search', navigate, location);
  const issueCreateModalHelpers = createQueryParamModalHelpers('issue-create', navigate, location);

  // ── Project list (for filter chips) ──────────────────────────────────────
  const [{ data: projectsData }, fetchProjects] = useApi.get('/projects');

  // ── Board data (lazy — fetched on demand with optional ?ids= param) ──────
  const [{ data, error, setLocalData }, fetchBoardData] = useApi.get(
    '/project',
    {},
    { lazy: true },
  );

  // ── Selected project IDs ─────────────────────────────────────────────────
  // Session state, not a stored preference. Persisting it made the board reopen
  // on a subset the user could not see they had chosen, which is what let
  // "Kanban Board" and "External Assignments" show the same projects.
  // `null` means "not initialised yet"; the effect then selects every project.
  const [selectedProjectIds, setSelectedProjectIds] = useState(null);

  // ── Effect: initialize + fetch board data ────────────────────────────────
  useEffect(() => {
    const projectList = projectsData?.projects;

    // Still loading the project list
    if (!projectList) return;

    // ── The URL filter, applied whenever it changes ────────────────────────
    // It is deliberately not persisted: a filtered view is a view, not the
    // user's preference, and writing it would make the next plain visit start
    // filtered.
    const filtered = filterSelection(filterParam, appliedFilter.current, projectList);
    appliedFilter.current = filterParam;

    // Compared against null, not tested for truthiness: an empty array is
    // truthy, and "the filter matches nothing" is a real answer that must show
    // an empty board rather than fall through to the unfiltered one.
    if (filtered !== null) {
      setSelectedProjectIds(filtered);
      return; // re-runs with the new ids
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

  // ── Project filter chips ─────────────────────────────────────────────────
  // Choosing projects here narrows the current view only. It is deliberately not
  // remembered: an invisible saved subset is what made the two sidebar entries
  // indistinguishable.
  const handleProjectFilterChange = useCallback((newIds) => {
    setSelectedProjectIds(newIds);
  }, []);

  // ── Refetch wrapper (backward compat for IssueCreate / ProjectSettings) ──
  const fetchProject = useCallback(() => {
    if (selectedProjectIds && selectedProjectIds.length > 0) {
      fetchBoardData({ ids: selectedProjectIds.join(',') });
    } else {
      fetchBoardData();
    }
  }, [selectedProjectIds, fetchBoardData]);

  // ── Force a sync now ─────────────────────────────────────────────────────
  const [{ isUpdating: isSyncing }, syncNow] = useApi.post('/projects/sync');

  const handleSyncNow = useCallback(async () => {
    try {
      await syncNow({});
      // The sync is awaited, so the refetch below already sees the new issues.
      await fetchProjects();
      fetchProject();
    } catch (apiError) {
      toast.error(apiError.message);
    }
  }, [syncNow, fetchProjects, fetchProject]);

  // ── Keep an open board up to date ────────────────────────────────────────
  /*
   * The server decides when a sync is due; the client only decides how often to
   * ask. Polling `/projects` at the configured cadence is what lets the interval
   * live in the settings tab — a client-side timer would need the value
   * hardcoded or fetched separately, and the two would drift.
   */
  const syncIntervalMinutes = projectsData?.syncIntervalMinutes;

  useEffect(() => {
    if (!syncIntervalMinutes) return undefined;
    const id = setInterval(fetchProjects, syncIntervalMinutes * 60 * 1000);
    return () => clearInterval(id);
  }, [syncIntervalMinutes, fetchProjects]);

  /*
   * A scheduled sync runs *after* the response that announced it, so the data on
   * screen is already known to be stale. Refetching once it has had time to
   * finish is what turns "a sync was queued" into issues the user can see.
   */
  const syncScheduled = projectsData?.syncScheduled;

  useEffect(() => {
    if (!syncScheduled) return undefined;
    const id = setTimeout(fetchProject, SYNC_SETTLE_MS);
    return () => clearTimeout(id);
  }, [syncScheduled, fetchProject]);

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

  // Check the error first: a failed load leaves `data` null, and rendering the
  // loader before this made every failure look like an endless spinner.
  if (error) return <PageError />;
  if (!normalizedProject) return <PageLoader />;

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
                      onSyncNow={handleSyncNow}
                      isSyncing={isSyncing}
                    />
                  }
                />
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
