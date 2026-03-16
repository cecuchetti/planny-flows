import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

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

const NAV_ITEMS = [
  { key: 'kanban', labelKey: 'sidebar.kanbanBoard', path: '/board', icon: '📋', bg: '#2563eb' },
  { key: 'external', labelKey: 'sidebar.externalAssignments', path: '/my-jira-issues', icon: '🔗', bg: '#7c3aed' },
  { key: 'settings', labelKey: 'sidebar.projectSettings', path: '/settings', icon: '⚙️', bg: '#475569' },
];

const MAINTENANCE_ITEMS = [
  { key: 'maintenance', labelKey: 'sidebar.maintenance', path: '/maintenance', icon: '🔧', bg: '#059669' },
];

const DISABLED_ITEMS = [
  { key: 'filters', label: 'Issues and filters', icon: '🔍', bg: '#94a3b8' },
  { key: 'pages', label: 'Pages', icon: '📄', bg: '#94a3b8' },
  { key: 'reports', label: 'Reports', icon: '📊', bg: '#94a3b8' },
];

const ProjectSidebar = ({ project: _project, onNavClick, isMobile }) => {
  const { t } = useTranslation();
  const basePath = '/project';

  return (
    <Sidebar $isMobile={isMobile}>
      {isMobile && (
        <MobileHeader>
          <span role="img" aria-label="menu">☰</span>
          Menu
        </MobileHeader>
      )}

      <NavSection>
        <SectionLabel>Principal</SectionLabel>

        {NAV_ITEMS.map(item => (
          <LinkItem 
            key={item.key} 
            to={`${basePath}${item.path}`} 
            end={item.path === '/board'}
            onClick={onNavClick}
          >
            <NavIcon $bg={item.bg}>{item.icon}</NavIcon>
            <LinkText>{t(item.labelKey)}</LinkText>
          </LinkItem>
        ))}

        <Divider />
        <SectionLabel>Más</SectionLabel>

        {MAINTENANCE_ITEMS.map(item => (
          <LinkItem 
            key={item.key} 
            to={`${basePath}${item.path}`}
            onClick={onNavClick}
          >
            <NavIcon $bg={item.bg}>{item.icon}</NavIcon>
            <LinkText>{t(item.labelKey)}</LinkText>
          </LinkItem>
        ))}

        {DISABLED_ITEMS.map(item => (
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
