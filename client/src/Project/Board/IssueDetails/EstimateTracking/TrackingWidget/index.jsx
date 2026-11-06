import React from 'react';
import PropTypes from 'prop-types';
import isNil from 'lodash/isNil';

const propTypes = {
  issue: PropTypes.object.isRequired,
  /** Renders the inline "Log work" button; hidden when the widget is shown inside the tracking modal. */
  showLogWorkButton: PropTypes.bool,
  onLogWork: PropTypes.func,
};

const defaultProps = {
  showLogWorkButton: true,
  onLogWork: null,
};

/* Demo values shown when the issue carries no tracking fields at all. */
const DEMO_PCT = 75;
const DEMO_LOGGED_LABEL = '6h logged';
const DEMO_REMAINING_LABEL = '2h remaining';

function ProjectBoardIssueDetailsTrackingWidget({
  issue,
  showLogWorkButton = true,
  onLogWork = null,
}) {
  const { timeSpent, timeRemaining, estimate } = issue;
  const hasNoCapacity = isNil(timeRemaining) && isNil(estimate);
  const hasAnyTrackingData = !isNil(timeSpent) || !hasNoCapacity;
  const isDemo = !hasAnyTrackingData;
  const pct = isDemo ? DEMO_PCT : Math.round(calculateTrackingBarWidth(issue));
  const hasCapacityContext = !hasNoCapacity;

  const loggedLabel = isDemo ? DEMO_LOGGED_LABEL : `${timeSpent || 0}h logged`;
  const getRemainingLabel = () => {
    if (isDemo) {
      return DEMO_REMAINING_LABEL;
    }
    if (!hasCapacityContext) {
      return 'No estimate set';
    }
    if (!isNil(timeRemaining)) {
      return `${timeRemaining}h remaining`;
    }
    return `${estimate}h estimated`;
  };
  const remainingLabel = getRemainingLabel();

  return (
    <div
      className="bg-surface-container-lowest p-space-md rounded-2xl shadow-xs flex flex-col gap-space-sm"
      data-testid="tracking-widget"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-label-lg text-label-lg font-semibold text-on-surface">
          <span className="material-symbols-outlined text-[18px] text-primary">timer</span>
          <span>Time tracking</span>
        </span>
        <span
          data-testid="tracking-pct"
          className="font-code-key text-code-key font-bold px-2 py-0.5 rounded-full bg-[#ede9fe] text-[#6d28d9]"
        >
          {pct}% complete
        </span>
      </div>

      {/* Progress Bar */}
      <div
        data-testid="tracking-bar"
        className="w-full h-2.5 rounded-full bg-surface-container overflow-hidden"
      >
        <div
          data-testid="tracking-bar-fill"
          className="h-full rounded-full bg-secondary-container transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Breakdown */}
      <div className="flex items-center justify-between font-code-key text-code-key pt-1">
        <span className="font-semibold text-on-surface" data-testid="tracking-logged">
          {loggedLabel}
        </span>
        <span
          data-testid="tracking-remaining"
          className={hasCapacityContext ? 'text-on-surface-variant' : 'text-on-surface-variant/60'}
        >
          {remainingLabel}
        </span>
      </div>

      {/* Log work action */}
      {showLogWorkButton && onLogWork && (
        <button
          type="button"
          onClick={onLogWork}
          data-testid="tracking-log-work"
          className="self-start flex items-center gap-1 px-2 py-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-label-md text-label-md font-semibold transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">add_circle</span>
          <span>Log work</span>
        </button>
      )}
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
ProjectBoardIssueDetailsTrackingWidget.defaultProps = defaultProps;

export default ProjectBoardIssueDetailsTrackingWidget;
