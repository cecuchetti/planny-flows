import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { IssueStatus } from 'shared/constants/issues';
import { Select } from 'shared/components';
import { issueStatusColors, jiraStatusColors } from 'shared/utils/styles';

/* eslint-disable react/require-default-props */

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
  isReadonly: PropTypes.bool,
};

const FALLBACK_STATUS_COLOR = '#64748b';

/**
 * Resolves a dot color for a status value. Enum values (backlog, inprogress, ...)
 * use the canonical map; arbitrary Jira status names (e.g. "code review") fall
 * back to a normalized-name lookup in the Jira palette.
 */
const getStatusColor = (status) => {
  if (issueStatusColors[status]) return issueStatusColors[status];
  const normalized = String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  if (jiraStatusColors[normalized]) return jiraStatusColors[normalized].text;
  return FALLBACK_STATUS_COLOR;
};

function ProjectBoardIssueDetailsStatus({ issue, updateIssue, isReadonly = false }) {
  const { t } = useTranslation();
  const options = Object.values(IssueStatus).map((status) => ({
    value: status,
    label: t(`issueStatuses.${status}`),
  }));

  const renderStatusRow = (status, showChevron) => {
    const color = getStatusColor(status);
    return (
      <div
        className={`flex items-center justify-between px-3 py-2 bg-surface-container-lowest rounded-xl shadow-xs transition-colors ${
          isReadonly ? 'cursor-default' : 'cursor-pointer hover:bg-surface-container-high'
        }`}
      >
        <div className="inline-flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span
            className="font-label-lg text-label-lg font-semibold"
            style={{ color }}
            data-testid={`issue-status-${status}`}
          >
            {t(`issueStatuses.${status}`) || status}
          </span>
        </div>
        {showChevron && (
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
            unfold_more
          </span>
        )}
      </div>
    );
  };

  if (isReadonly) {
    return (
      <Fragment>
        <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
          {t('issue.statusLabel')}
        </span>
        {renderStatusRow(issue.status, false)}
      </Fragment>
    );
  }

  return (
    <Fragment>
      <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
        {t('issue.statusLabel')}
      </span>
      <Select
        variant="empty"
        dropdownWidth={343}
        withClearValue={false}
        name="status"
        value={issue.status}
        options={options}
        onChange={(status) => updateIssue({ status })}
        renderValue={({ value: status }) => renderStatusRow(status, true)}
        renderOption={({ value: status }) => (
          <div className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-surface-container rounded-lg">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: issueStatusColors[status] || '#64748b' }}
            />
            <span
              className="font-label-md text-label-md font-semibold"
              style={{ color: issueStatusColors[status] || '#64748b' }}
            >
              {t(`issueStatuses.${status}`)}
            </span>
          </div>
        )}
      />
    </Fragment>
  );
}

ProjectBoardIssueDetailsStatus.propTypes = propTypes;

export default ProjectBoardIssueDetailsStatus;
