/* eslint-disable react/require-default-props -- optional props are read, never required */
import React from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { addToQueryString } from 'shared/utils/url';

/**
 * Board header.
 *
 * Carries the forced sync. The board also refreshes on the interval configured
 * in settings, but waiting up to fifteen minutes for a change you just made in
 * Jira is not acceptable when a button can do it now.
 */
function ProjectBoardHeader({ onSyncNow, isSyncing }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex items-center justify-between mt-1">
      <div className="flex items-center gap-3">
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
          {t('board.kanbanBoardLabel')}
        </h1>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-code-key text-code-key">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          LIVE SYNC
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        {onSyncNow && (
          <button
            type="button"
            disabled={isSyncing}
            onClick={onSyncNow}
            className="group h-[34px] px-3.5 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg flex items-center gap-2 shadow-sm hover:bg-surface-container-low transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-default"
          >
            <span className={`material-symbols-outlined text-[18px] text-on-surface-variant ${isSyncing ? 'animate-spin' : 'group-hover:rotate-180'} transition-transform duration-300`}>
              sync
            </span>
            <span>{isSyncing ? t('board.syncing') : t('board.syncNow')}</span>
            <span className="material-symbols-outlined text-[16px] text-outline">
              keyboard_arrow_down
            </span>
          </button>
        )}
        <a
          href="https://github.com/oldboyxx/jira_clone"
          target="_blank"
          rel="noreferrer noopener"
        >
          <button
            type="button"
            className="h-[34px] px-3.5 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg flex items-center gap-2 shadow-sm hover:bg-surface-container-low transition-all active:scale-[0.98]"
          >
            <svg className="w-4 h-4 fill-current text-on-surface" viewBox="0 0 24 24">
              <path
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                fillRule="evenodd"
              />
            </svg>
            <span>{t('common.githubRepo')}</span>
          </button>
        </a>
        <button
          type="button"
          onClick={() => navigate({ pathname: location.pathname, search: addToQueryString(location.search, { 'modal-issue-create': true }) })}
          className="h-[34px] px-3.5 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg flex items-center gap-1.5 shadow-sm hover:bg-primary-container transition-all active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>{t('nav.createIssue')}</span>
        </button>
      </div>
    </div>
  );
}

ProjectBoardHeader.propTypes = {
  onSyncNow: PropTypes.func,
  isSyncing: PropTypes.bool,
};

export default ProjectBoardHeader;
