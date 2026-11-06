import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { IssueType } from 'shared/constants/issues';
import { Select } from 'shared/components';

/* eslint-disable react/require-default-props */

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
  isReadonly: PropTypes.bool,
};

const typePillStyles = {
  [IssueType.BUG]: 'bg-[#fee2e2] text-[#b91c1c]',
  [IssueType.TASK]: 'bg-[#dbeafe] text-[#1d4ed8]',
  [IssueType.STORY]: 'bg-[#dcfce7] text-[#15803d]',
};

const typeIcons = {
  [IssueType.BUG]: 'bug_report',
  [IssueType.TASK]: 'task_alt',
  [IssueType.STORY]: 'auto_stories',
};

function ProjectBoardIssueDetailsType({ issue, updateIssue, isReadonly = false }) {
  const { t } = useTranslation();
  const options = Object.values(IssueType).map((type) => ({
    value: type,
    label: t(`issueTypes.${type}`),
  }));

  const issueKey = issue.key || issue.externalKey || issue.external_key;

  // Trigger pill shared between readonly (static) and editable (select value)
  const renderPill = (type) => {
    const typeLabel = t(`issueTypes.${type}`) || type;
    const classes = typePillStyles[type] || typePillStyles[IssueType.TASK];
    const icon = typeIcons[type] || 'task_alt';
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md cursor-pointer hover:brightness-95 transition-colors ${classes}`}
      >
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
        <span className="font-code-key text-code-key font-bold tracking-tight">
          {typeLabel}
          {issueKey ? ` ${issueKey}` : ''}
        </span>
        {!isReadonly && (
          <span className="material-symbols-outlined text-[16px] opacity-70">expand_more</span>
        )}
      </span>
    );
  };

  if (isReadonly) {
    return renderPill(issue.type);
  }

  return (
    <Select
      variant="empty"
      dropdownWidth={150}
      withClearValue={false}
      name="type"
      value={issue.type}
      options={options}
      onChange={(type) => updateIssue({ type })}
      renderValue={({ value: type }) => renderPill(type)}
      renderOption={({ value: type }) => (
        <button
          key={type}
          type="button"
          onClick={() => updateIssue({ type })}
          className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-surface-container rounded-lg font-label-md text-label-md w-full text-left"
        >
          <span className="material-symbols-outlined text-[16px]">{typeIcons[type]}</span>
          <span>{t(`issueTypes.${type}`)}</span>
        </button>
      )}
    />
  );
}

ProjectBoardIssueDetailsType.propTypes = propTypes;

export default ProjectBoardIssueDetailsType;
