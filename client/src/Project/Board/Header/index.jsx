import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from 'shared/components';

import { Header, BoardName } from './Styles';

const ProjectBoardHeader = () => {
  const { t } = useTranslation();
  return (
    <Header>
      <BoardName>{t('board.kanbanBoardLabel')}</BoardName>
      <a href="https://github.com/oldboyxx/jira_clone" target="_blank" rel="noreferrer noopener">
        <Button icon="github">{t('common.githubRepo')}</Button>
      </a>
    </Header>
  );
};

export default ProjectBoardHeader;
