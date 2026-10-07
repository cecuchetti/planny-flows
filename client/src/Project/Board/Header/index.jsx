/* eslint-disable react/require-default-props -- optional props are read, never required */
import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { Button } from 'shared/components';

import { Header, BoardName, HeaderActions } from './Styles';

/**
 * Board header.
 *
 * Carries the forced sync. The board also refreshes on the interval configured
 * in settings, but waiting up to fifteen minutes for a change you just made in
 * Jira is not acceptable when a button can do it now.
 */
function ProjectBoardHeader({ onSyncNow, isSyncing }) {
  const { t } = useTranslation();

  return (
    <Header>
      <BoardName>{t('board.kanbanBoardLabel')}</BoardName>
      <HeaderActions>
        {onSyncNow && (
          <Button icon="arrow-down" isWorking={isSyncing} onClick={onSyncNow}>
            {isSyncing ? t('board.syncing') : t('board.syncNow')}
          </Button>
        )}
        <a href="https://github.com/oldboyxx/jira_clone" target="_blank" rel="noreferrer noopener">
          <Button icon="github">{t('common.githubRepo')}</Button>
        </a>
      </HeaderActions>
    </Header>
  );
}

ProjectBoardHeader.propTypes = {
  onSyncNow: PropTypes.func,
  isSyncing: PropTypes.bool,
};

export default ProjectBoardHeader;
