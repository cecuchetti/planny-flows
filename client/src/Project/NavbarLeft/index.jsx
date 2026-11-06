import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { AboutTooltip } from 'shared/components';

import { StyledLogo } from './Styles';

const propTypes = {
  issueSearchModalOpen: PropTypes.func.isRequired,
  issueCreateModalOpen: PropTypes.func.isRequired,
};

const ProjectNavbarLeft = ({ issueSearchModalOpen, issueCreateModalOpen }) => {
  const { t, i18n } = useTranslation();

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-screen w-16 shrink-0 flex-col items-center bg-surface-container-lowest border-r border-outline-variant/40 py-4 gap-2 drop-shadow-sm max-md:hidden">
      {/* Logo tile */}
      <a
        href="/"
        className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center shadow-inner shadow-white/20 mb-2"
        aria-label="Home"
      >
        <StyledLogo />
      </a>

      {/* Search */}
      <button
        type="button"
        onClick={issueSearchModalOpen}
        aria-label={t('nav.searchIssues')}
        title={t('nav.searchIssues')}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
      >
        <span className="material-symbols-outlined text-[22px]">search</span>
      </button>

      {/* Create issue */}
      <button
        type="button"
        onClick={issueCreateModalOpen}
        aria-label={t('nav.createIssue')}
        title={t('nav.createIssue')}
        className="w-10 h-10 rounded-lg bg-primary text-on-primary flex items-center justify-center shadow-sm hover:bg-primary-container transition-all active:scale-95"
      >
        <span className="material-symbols-outlined text-[22px]">add</span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom: language + about */}
      <div className="flex flex-col items-center gap-2 pb-1">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className={
              'w-9 h-6 rounded-md font-code-key text-[11px] font-semibold flex items-center justify-center transition-colors ' +
              (i18n.language === 'en'
                ? 'bg-primary-fixed text-primary border border-primary-fixed-dim/80'
                : 'text-on-surface-variant hover:text-on-surface border border-outline-variant/50')
            }
            onClick={() => i18n.changeLanguage('en')}
            aria-label="English"
          >
            EN
          </button>
          <button
            type="button"
            className={
              'w-9 h-6 rounded-md font-code-key text-[11px] font-semibold flex items-center justify-center transition-colors ' +
              (i18n.language === 'es'
                ? 'bg-primary-fixed text-primary border border-primary-fixed-dim/80'
                : 'text-on-surface-variant hover:text-on-surface border border-outline-variant/50')
            }
            onClick={() => i18n.changeLanguage('es')}
            aria-label="Español"
          >
            ES
          </button>
        </div>
        <AboutTooltip
          placement="right"
          offset={{ top: -218 }}
          renderLink={(linkProps) => (
            <button
              type="button"
              {...linkProps}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
              aria-label={t('nav.about')}
            >
              <span className="material-symbols-outlined text-[22px]">help</span>
            </button>
          )}
        />
      </div>
    </aside>
  );
};

ProjectNavbarLeft.propTypes = propTypes;

export default ProjectNavbarLeft;
