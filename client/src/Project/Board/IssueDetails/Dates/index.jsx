import React from 'react';
import PropTypes from 'prop-types';

import { formatDateTimeConversational } from 'shared/utils/dateTime';

const propTypes = {
  issue: PropTypes.object.isRequired,
};

function ProjectBoardIssueDetailsDates({ issue }) {
  return (
    <div className="flex flex-col gap-2 pt-space-xs">
      <div className="flex items-center justify-between">
        <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
          Created
        </span>
        <span className="font-code-key text-code-key text-on-surface">
          {formatDateTimeConversational(issue.createdAt)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
          Updated
        </span>
        <span className="font-code-key text-code-key text-on-surface">
          {formatDateTimeConversational(issue.updatedAt)}
        </span>
      </div>
    </div>
  );
}

ProjectBoardIssueDetailsDates.propTypes = propTypes;

export default ProjectBoardIssueDetailsDates;
