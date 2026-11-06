import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { IssuePriority } from 'shared/constants/issues';
import { Select } from 'shared/components';

/* eslint-disable react/require-default-props */

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
  isReadonly: PropTypes.bool,
};

const priorityChipStyles = {
  [IssuePriority.HIGHEST]: 'bg-error-container text-on-error-container',
  [IssuePriority.HIGH]: 'bg-[#ffedd5] text-[#c2410c]',
  [IssuePriority.MEDIUM]: 'bg-[#fef9c3] text-[#a16207]',
  [IssuePriority.LOW]: 'bg-[#dcfce7] text-[#15803d]',
  [IssuePriority.LOWEST]: 'bg-surface-container text-on-surface-variant',
};

const priorityIcons = {
  [IssuePriority.HIGHEST]: 'priority_high',
  [IssuePriority.HIGH]: 'priority_high',
  [IssuePriority.MEDIUM]: 'remove',
  [IssuePriority.LOW]: 'arrow_downward',
  [IssuePriority.LOWEST]: 'keyboard_double_arrow_down',
};

function ProjectBoardIssueDetailsPriority({ issue, updateIssue, isReadonly = false }) {
  const { t } = useTranslation();
  const options = Object.values(IssuePriority).map((priority) => ({
    value: priority,
    label: t(`issuePriorities.${priority}`),
  }));

  const renderPriorityChip = (priority, showChevron = false) => {
    const classes = priorityChipStyles[priority] || priorityChipStyles[IssuePriority.MEDIUM];
    const icon = priorityIcons[priority] || 'remove';
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-label-md text-label-md font-semibold w-max shadow-xs transition-colors ${
          isReadonly ? 'cursor-default' : 'cursor-pointer hover:brightness-95'
        } ${classes}`}
        data-testid={`issue-priority-${priority}`}
      >
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
        <span>{t(`issuePriorities.${priority}`) || priority}</span>
        {showChevron && (
          <span className="material-symbols-outlined text-[16px] opacity-70">expand_more</span>
        )}
      </div>
    );
  };

  if (isReadonly) {
    return (
      <Fragment>
        <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
          {t('issue.priorityLabel')}
        </span>
        {renderPriorityChip(issue.priority, false)}
      </Fragment>
    );
  }

  return (
    <Fragment>
      <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
        {t('issue.priorityLabel')}
      </span>
      <Select
        variant="empty"
        dropdownWidth={180}
        withClearValue={false}
        name="priority"
        value={issue.priority}
        options={options}
        onChange={(priority) => updateIssue({ priority })}
        renderValue={({ value: priority }) => renderPriorityChip(priority, true)}
        renderOption={({ value: priority }) => (
          <button
            key={priority}
            type="button"
            onClick={() => updateIssue({ priority })}
            className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-surface-container rounded-lg w-full text-left"
          >
            <span
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg font-label-md text-label-md font-semibold ${
                priorityChipStyles[priority] || ''
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {priorityIcons[priority] || 'remove'}
              </span>
              {t(`issuePriorities.${priority}`)}
            </span>
          </button>
        )}
      />
    </Fragment>
  );
}

ProjectBoardIssueDetailsPriority.propTypes = propTypes;

export default ProjectBoardIssueDetailsPriority;
