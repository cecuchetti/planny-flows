import React from 'react';
import PropTypes from 'prop-types';

import { sortByNewest } from 'shared/utils/javascript';

import Create from './Create';
import Comment from './Comment';

const propTypes = {
  issue: PropTypes.object.isRequired,
  fetchIssue: PropTypes.func.isRequired,
};

function ProjectBoardIssueDetailsComments({ issue, fetchIssue }) {
  const comments = sortByNewest(issue.comments, 'createdAt');

  return (
    <div className="flex flex-col gap-space-md pt-space-xs">
      {/* Section header: overline + count pill */}
      <div className="flex items-center gap-2">
        <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
          Comments
        </span>
        <span className="font-code-key text-code-key bg-surface-container px-2 py-0.5 rounded-full text-on-surface-variant font-semibold">
          {comments.length}
        </span>
      </div>

      {/* Composer */}
      <Create issueId={issue.id} fetchIssue={fetchIssue} />

      {/* Comment stream */}
      {comments.map((comment) => (
        <Comment key={comment.id} comment={comment} fetchIssue={fetchIssue} />
      ))}
    </div>
  );
}

ProjectBoardIssueDetailsComments.propTypes = propTypes;

export default ProjectBoardIssueDetailsComments;
