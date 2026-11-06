import React from 'react';
import PropTypes from 'prop-types';

import { formatDateTimeConversational } from 'shared/utils/dateTime';

const propTypes = {
  issue: PropTypes.object.isRequired,
};

function ProjectBoardIssueDetailsDates({ issue }) {
  const renderDateRow = (label, value) => (
    <div className="flex items-center justify-between" data-testid={`issue-date-${label.toLowerCase()}`}>
      <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      <span className="flex items-center gap-1.5 font-code-key text-code-key text-on-surface">
        <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
          calendar_today
        </span>
        {formatDateTimeConversational(value)}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2 pt-space-xs">
      {renderDateRow('Created', issue.createdAt)}
      {renderDateRow('Updated', issue.updatedAt)}
    </div>
  );
}

ProjectBoardIssueDetailsDates.propTypes = propTypes;

export default ProjectBoardIssueDetailsDates;
