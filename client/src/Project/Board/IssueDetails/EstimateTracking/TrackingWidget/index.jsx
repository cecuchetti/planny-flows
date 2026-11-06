import React from 'react';
import PropTypes from 'prop-types';
import isNil from 'lodash/isNil';

const propTypes = {
  issue: PropTypes.object.isRequired,
};

function ProjectBoardIssueDetailsTrackingWidget({ issue }) {
  const { timeSpent, timeRemaining, estimate } = issue;
  const hasNoCapacity = isNil(timeRemaining) && isNil(estimate);
  const pct = Math.round(calculateTrackingBarWidth(issue));
  const hasEstimate = !hasNoCapacity;

  return (
    <div className="bg-surface-container-lowest p-space-md rounded-2xl shadow-xs flex flex-col gap-space-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-label-lg text-label-lg font-semibold text-on-surface">
          <span className="material-symbols-outlined text-[18px] text-primary">timer</span>
          <span>Time tracking</span>
        </span>
        {hasEstimate && (
          <span className="font-code-key text-code-key font-bold px-2 py-0.5 rounded-full bg-[#ede9fe] text-[#6d28d9]">
            {pct}% complete
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2.5 rounded-full bg-surface-container overflow-hidden">
        <div
          className="h-full rounded-full bg-primary-container transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Breakdown */}
      <div className="flex items-center justify-between font-code-key text-code-key pt-1">
        <span className="font-semibold text-on-surface">
          {timeSpent ? `${timeSpent}h logged` : '0h logged'}
        </span>
        {hasEstimate ? (
          <span className="text-on-surface-variant">
            {!isNil(timeRemaining) ? `${timeRemaining}h remaining` : `${estimate}h estimated`}
          </span>
        ) : (
          <span className="text-on-surface-variant/60">No estimate set</span>
        )}
      </div>
    </div>
  );
}

const calculateTrackingBarWidth = ({ timeSpent, timeRemaining, estimate }) => {
  if (!timeSpent) {
    return 0;
  }
  if (isNil(timeRemaining) && isNil(estimate)) {
    return 100;
  }
  if (!isNil(timeRemaining)) {
    return (timeSpent / (timeSpent + timeRemaining)) * 100;
  }
  if (!isNil(estimate)) {
    return Math.min((timeSpent / estimate) * 100, 100);
  }
  return 0;
};

ProjectBoardIssueDetailsTrackingWidget.propTypes = propTypes;

export default ProjectBoardIssueDetailsTrackingWidget;
