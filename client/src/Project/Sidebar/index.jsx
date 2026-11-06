import React from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { LOANS_ENABLED } from 'shared/utils/loansFlag';

import { Sidebar, LinkItem, DisabledItem } from './Styles';

const propTypes = {
  project: PropTypes.object.isRequired,
  onNavClick: PropTypes.func,
  isMobile: PropTypes.bool,
};

/*
 * Principal: the views the operator works in, in the order they asked for —
 * Personas first (the directory every loan hangs off), then the board, then the
 * loans page. The Préstamos entries exist only when the module was built in;
 * with the flag off they are not rendered at all, so nothing points at a route
 * that is not registered.
 *
 * One board entry, not two: "External Assignments" pointed at this same board
 * with `?filter=jira`, so it was a filter wearing a tab's clothes — and a
 * misleading name, because that filter selects by project *source*, not by who
 * the issue is assigned to.
 *
 * Both loans entries are children of `/project` like every other item here, so
 * they take the host's own active highlight instead of being `absolute` routes.
 * "Préstamos" is one page — the portfolio summary on top and the loan list below
 * — so it points at `/loans` and is `exact`, which keeps Personas and the other
 * children from highlighting it too.
 */
const PRINCIPAL_ITEMS = [
  ...(LOANS_ENABLED
    ? [
        {
          key: 'borrowers',
          labelKey: 'sidebar.borrowers',
          path: '/loans/borrowers',
          icon: '👥',
          bg: '#7c3aed',
        },
      ]
    : []),
  { key: 'kanban', labelKey: 'sidebar.kanbanBoard', path: '/board', icon: '📋', bg: '#2563eb' },
  ...(LOANS_ENABLED
    ? [
        {
          key: 'loans',
          labelKey: 'common.loans',
          path: '/loans',
          icon: '💸',
          bg: '#7c3aed',
          exact: true,
        },
      ]
    : []),
];

/* The one real view under "Más", ahead of the placeholders. */
const MORE_ITEMS = [
  {
    key: 'quick-actions',
    labelKey: 'sidebar.quickActions',
    path: '/quick-actions',
    icon: '🔧',
    bg: '#059669',
  },
];

const DISABLED_ITEMS = [
  { key: 'filters', label: 'Issues and filters', icon: '🔍', bg: '#94a3b8' },
  { key: 'pages', label: 'Pages', icon: '📄', bg: '#94a3b8' },
  { key: 'reports', label: 'Reports', icon: '📊', bg: '#94a3b8' },
];

/*
 * Project administration, not one of the views the operator lives in all day, so
 * it sits at the foot of "Más" — below the placeholders rather than above them.
 */
const SETTINGS_ITEM = {
  key: 'settings',
  labelKey: 'sidebar.projectSettings',
  path: '/settings',
  icon: '⚙️',
  bg: '#475569',
};

const ProjectSidebar = ({ project: _project, onNavClick, isMobile }) => {
  const location = useLocation();
  const { t } = useTranslation();
  const basePath = '/project';

  const itemPath = (item) => (item.absolute ? item.path : `${basePath}${item.path}`);

  const isActiveLink = (item) => {
    const [pathPart, queryString] = item.path.split('?');
    const fullPath = item.absolute ? pathPart : `${basePath}${pathPart}`;
    const pathMatches = item.exact
      ? location.pathname === fullPath
      : location.pathname === fullPath || location.pathname.startsWith(`${fullPath}/`);

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

  /** Emoji tile with label — horizontal row on desktop, vertical stack on mobile. */
  const linkItem = (item) => {
    const active = isActiveLink(item);
    return (
      <LinkItem
        key={item.key}
        to={itemPath(item)}
        className={`no-underline rounded-xl transition-colors cursor-pointer w-full ${
          isMobile
            ? 'flex flex-col items-center gap-1'
            : 'flex items-center gap-3 px-3 py-2.5'
        } ${
          active
            ? 'bg-surface-container text-on-surface font-semibold'
            : 'text-on-surface-variant font-medium hover:bg-surface-container/50'
        }`}
        onClick={onNavClick}
      >
        <span
          className="w-8 h-8 rounded-lg shadow-inner flex items-center justify-center text-sm shrink-0"
          style={{ backgroundColor: `${item.bg}22` }}
        >
          {item.icon}
        </span>
        <span
          className={`${
            isMobile
              ? 'font-label-md text-label-md text-center text-[11px] leading-tight'
              : 'font-label-lg text-label-lg'
          }`}
        >
          {t(item.labelKey || item.label)}
        </span>
      </LinkItem>
    );
  };

  return (
    <Sidebar
      className={`
        flex-shrink-0
        ${isMobile ? 'w-full border-r-0 pt-0' : 'w-60'}
        ${isMobile ? 'bg-gradient-to-b from-[#1c1f2e] to-[#2d2060]' : 'bg-surface-container-lowest bg-white'}
        flex flex-col gap-2 py-4 px-2
        overflow-y-auto
      `}
    >
      {isMobile && (
        <div className="flex items-center gap-2.5 px-3.5 py-4 bg-gradient-to-r from-[#1c1f2e] to-[#2d2060] text-white font-semibold text-base mb-2 w-full">
          <span role="img" aria-label="menu">
            ☰
          </span>
          Menu
        </div>
      )}

      {/* Principal section */}
      <div className={`flex flex-col gap-2 w-full ${isMobile ? 'items-center' : 'items-stretch'}`}>
        <span className={`font-overline text-overline text-outline uppercase tracking-wider w-full ${isMobile ? 'text-center px-2' : 'px-3 mb-1'}`}>
          Principal
        </span>
        {PRINCIPAL_ITEMS.map(linkItem)}

        <div className={`w-3/4 border-t my-1 self-center ${isMobile ? 'border-white/10' : 'border-outline-variant/50'}`} />

        <span className={`font-overline text-overline text-outline uppercase tracking-wider w-full ${isMobile ? 'text-center px-2' : 'px-3 mb-1'}`}>
          Más
        </span>
        {MORE_ITEMS.map(linkItem)}

        {DISABLED_ITEMS.map((item) => (
          <DisabledItem
            key={item.key}
            className={`
              no-underline rounded-xl opacity-30 cursor-not-allowed w-full
              ${isMobile
                ? 'flex flex-col items-center gap-1'
                : 'flex items-center gap-3 px-3 py-2.5'
              }
            `}
          >
            <span
              className="w-8 h-8 rounded-lg shadow-inner flex items-center justify-center text-sm shrink-0"
              style={{ backgroundColor: `${item.bg}22` }}
            >
              {item.icon}
            </span>
            <span className={`${isMobile ? 'font-label-md text-label-md text-center text-[11px] leading-tight' : 'font-label-lg text-label-lg'} text-on-surface-variant`}>
              {item.label}
            </span>
          </DisabledItem>
        ))}

        {linkItem(SETTINGS_ITEM)}
      </div>
    </Sidebar>
  );
};

ProjectSidebar.propTypes = propTypes;

export default ProjectSidebar;
