import React from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { LOANS_ENABLED } from 'shared/utils/loansFlag';

import {
  Sidebar,
  NavSection,
  SectionLabel,
  Divider,
  LinkItem,
  DisabledItem,
  NavIcon,
  LinkText,
  MobileHeader,
} from './Styles';

const propTypes = {
  project: PropTypes.object.isRequired,
  onNavClick: PropTypes.func,
  isMobile: PropTypes.bool,
};

/*
 * One board entry, not two.
 *
 * "External Assignments" pointed at this same board with `?filter=jira`, so it
 * was a filter wearing a tab's clothes — and a misleading name, because that
 * filter selects by project *source*, not by who the issue is assigned to. The
 * project chips already narrow the board, and they say what they are doing.
 */
const NAV_ITEMS = [
  { key: 'kanban', labelKey: 'sidebar.kanbanBoard', path: '/board', icon: '📋', bg: '#2563eb' },
  {
    key: 'settings',
    labelKey: 'sidebar.projectSettings',
    path: '/settings',
    icon: '⚙️',
    bg: '#475569',
  },
];

/*
 * Quick actions is always present; Loans only when it was built in. With the
 * flag off the entry is not rendered at all, so nothing points at a route that
 * is not registered.
 *
 * `absolute` marks a path that lives outside the project's URL space. The
 * project items are relative to `/project`; `/loans` is a top-level route of
 * its own, so it must not be prefixed.
 */
const MORE_ITEMS = [
  {
    key: 'quick-actions',
    labelKey: 'sidebar.quickActions',
    path: '/quick-actions',
    icon: '🔧',
    bg: '#059669',
  },
  ...(LOANS_ENABLED
    ? [
        {
          key: 'loans',
          labelKey: 'common.loans',
          path: '/loans',
          icon: '💸',
          bg: '#7c3aed',
          absolute: true,
        },
      ]
    : []),
];

const DISABLED_ITEMS = [
  { key: 'filters', label: 'Issues and filters', icon: '🔍', bg: '#94a3b8' },
  { key: 'pages', label: 'Pages', icon: '📄', bg: '#94a3b8' },
  { key: 'reports', label: 'Reports', icon: '📊', bg: '#94a3b8' },
];

const ProjectSidebar = ({ project: _project, onNavClick, isMobile }) => {
  const location = useLocation();
  const { t } = useTranslation();
  const basePath = '/project';

  const itemPath = (item) => (item.absolute ? item.path : `${basePath}${item.path}`);

  const isActiveLink = (item) => {
    const [pathPart, queryString] = item.path.split('?');
    const fullPath = item.absolute ? pathPart : `${basePath}${pathPart}`;
    const pathMatches =
      location.pathname === fullPath || location.pathname.startsWith(`${fullPath}/`);

    if (queryString) {
      // Item has a query-param requirement
      return pathMatches && location.search === `?${queryString}`;
    }
    if (item.path === '/board') {
      // The board with no filter and the board with an explicit "all" are the
      // same view, so both keep this item highlighted.
      const filter = new URLSearchParams(location.search).get('filter');
      return pathMatches && (!filter || filter === 'all');
    }
    // Default: pathname-based match
    return pathMatches;
  };

  return (
    <Sidebar $isMobile={isMobile}>
      {isMobile && (
        <MobileHeader>
          <span role="img" aria-label="menu">
            ☰
          </span>
          Menu
        </MobileHeader>
      )}

      <NavSection>
        <SectionLabel>Principal</SectionLabel>

        {NAV_ITEMS.map((item) => {
          const isActive = isActiveLink(item);
          return (
            <LinkItem
              key={item.key}
              to={itemPath(item)}
              className={isActive ? 'active' : ''}
              onClick={onNavClick}
            >
              <NavIcon $bg={item.bg}>{item.icon}</NavIcon>
              <LinkText>{t(item.labelKey)}</LinkText>
            </LinkItem>
          );
        })}

        <Divider />
        <SectionLabel>Más</SectionLabel>

        {MORE_ITEMS.map((item) => (
          <LinkItem
            key={item.key}
            to={itemPath(item)}
            className={isActiveLink(item) ? 'active' : ''}
            onClick={onNavClick}
          >
            <NavIcon $bg={item.bg}>{item.icon}</NavIcon>
            <LinkText>{t(item.labelKey)}</LinkText>
          </LinkItem>
        ))}

        {DISABLED_ITEMS.map((item) => (
          <DisabledItem key={item.key}>
            <NavIcon $bg={item.bg}>{item.icon}</NavIcon>
            <LinkText>{item.label}</LinkText>
          </DisabledItem>
        ))}
      </NavSection>
    </Sidebar>
  );
};

ProjectSidebar.propTypes = propTypes;

export default ProjectSidebar;
