import React from 'react';
import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ProjectCategoryCopy } from 'shared/constants/projects';
import { Icon, ProjectAvatar } from 'shared/components';

import {
  Sidebar,
  ProjectInfo,
  ProjectTexts,
  ProjectName,
  ProjectCategory,
  Divider,
  LinkItem,
  LinkText,
  NotImplemented,
} from './Styles';

const propTypes = {
  project: PropTypes.object.isRequired,
};

const ProjectSidebar = ({ project }) => {
  const { t } = useTranslation();
  const basePath = '/project';

  return (
    <Sidebar>
      <ProjectInfo>
        <ProjectAvatar />
        <ProjectTexts>
          <ProjectName>{project.name}</ProjectName>
          <ProjectCategory>{ProjectCategoryCopy[project.category]} project</ProjectCategory>
        </ProjectTexts>
      </ProjectInfo>

      {renderLinkItem(basePath, t('sidebar.kanbanBoard'), 'board', '/board')}
      {renderLinkItem(basePath, t('sidebar.externalAssignments'), 'issues', '/my-jira-issues')}
      {renderLinkItem(basePath, t('sidebar.projectSettings'), 'settings', '/settings')}
      <Divider />
      {renderLinkItem(basePath, 'Releases', 'shipping')}
      {renderLinkItem(basePath, 'Issues and filters', 'issues')}
      {renderLinkItem(basePath, 'Pages', 'page')}
      {renderLinkItem(basePath, 'Reports', 'reports')}
      {renderLinkItem(basePath, 'Components', 'component')}
    </Sidebar>
  );
};

const renderLinkItem = (basePath, text, iconType, path) => {
  const isImplemented = !!path;

  const linkItemProps = isImplemented
    ? { as: NavLink, to: `${basePath}${path}`, end: true }
    : { as: 'div' };

  return (
    <LinkItem {...linkItemProps}>
      <Icon type={iconType} />
      <LinkText>{text}</LinkText>
      {!isImplemented && <NotImplemented>Not implemented</NotImplemented>}
    </LinkItem>
  );
};

ProjectSidebar.propTypes = propTypes;

export default ProjectSidebar;
