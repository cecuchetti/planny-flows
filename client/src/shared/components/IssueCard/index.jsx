import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

const cardBaseClasses =
  'relative bg-surface-container-lowest rounded-xl p-3.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group overflow-hidden';

const IssueCard = forwardRef(({ issue, isBeingDragged = false, className = '', ...props }, ref) => {
  const {
    key: issueKey,
    title,
    stripColor,
    badges = [],
    assignees = [],
    to,
    onClick,
    done = false,
    estimateText,
    updatedAt,
  } = issue;

  const stripHex = stripColor || '#e5e7eb';

  const dragClasses = isBeingDragged
    ? 'rotate-[1.5deg] -translate-y-0.5 shadow-xl border-2 border-secondary'
    : '';

  const opacityClasses = done ? 'opacity-90 hover:opacity-100' : '';

  /** Format seconds into a compact relative time string like "Yesterday", "Today", "2d ago" */
  const formatRelativeDay = (dateStr) => {
    if (!dateStr) return null;
    const then = new Date(dateStr);
    const now = new Date();
    const diffMs = now - then;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  };

  /** Produce the right-side footer content */
  const renderFooterRight = () => {
    if (done) {
      // Done cards show status text like "Completed today" / "Yesterday" / "3d ago"
      const relativeDay = formatRelativeDay(updatedAt);
      if (relativeDay) {
        return (
          <span className="text-on-surface-variant font-code-key text-code-key">
            {relativeDay}
          </span>
        );
      }
      // Fallback: show estimate if available
      if (estimateText) {
        return (
          <div className="flex items-center gap-1 text-on-surface-variant font-code-key text-code-key">
            <span className="material-symbols-outlined text-[13px] text-tertiary">check_circle</span>
            <span>{estimateText}</span>
          </div>
        );
      }
      return null;
    }

    // Non-done: show estimate if available
    if (estimateText) {
      return (
        <div className="flex items-center gap-1 text-on-surface-variant font-code-key text-code-key">
          <span className="material-symbols-outlined text-[13px] text-outline">timer</span>
          <span>{estimateText}</span>
        </div>
      );
    }

    return null;
  };

  const footerRight = renderFooterRight();

  const cardContent = (
    <React.Fragment>
      {/* Accent Priority Strip */}
      <div
        className="absolute top-0 left-0 h-1 w-[40%] rounded-tr-sm"
        style={{ backgroundColor: stripHex }}
      />

      {/* Card body */}
      <div className="pt-1 pb-0">
        {issueKey && (
          <div className="flex items-center justify-between pb-1.5">
            <span
              className={`font-code-key text-code-key text-on-surface-variant group-hover:text-primary transition-colors${done ? ' line-through' : ''}`}
            >
              {issueKey}
            </span>
            {done ? (
              <span className="material-symbols-outlined text-[16px] text-tertiary">
                check_circle
              </span>
            ) : (
              <span className="material-symbols-outlined text-[16px] text-outline opacity-0 group-hover:opacity-100 transition-opacity">
                more_horiz
              </span>
            )}
          </div>
        )}
        <h3
          className="font-label-lg text-label-lg text-on-surface font-semibold line-clamp-2 leading-snug mb-2.5"
          title={title}
        >
          {title}
        </h3>

        {/* Badge row */}
        {badges.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {badges.map((badge) => (
              <span
                key={`${badge.text}-${badge.bgColor}-${badge.textColor}`}
                className="inline-flex items-center px-2 py-0.5 rounded-md font-overline text-overline"
                style={{
                  backgroundColor: badge.bgColor,
                  color: badge.textColor,
                }}
              >
                {badge.text}
              </span>
            ))}
            {/* Estimate chip */}
            {estimateText && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-surface-container-low text-on-surface-variant font-code-key text-[10px]">
                {estimateText}
              </span>
            )}
          </div>
        )}

        {/* Card Footer */}
        {assignees.length > 0 && (
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center -space-x-1.5">
              {assignees.map((assignee) => (
                <div
                  key={
                    assignee.id ?? `${assignee.name}-${assignee.avatarUrl || 'no-avatar'}`
                  }
                  className="w-[22px] h-[22px] rounded-full ring-2 ring-surface-container-lowest shadow-sm overflow-hidden"
                >
                  {assignee.avatarUrl ? (
                    <div
                      className="w-full h-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${assignee.avatarUrl})` }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-secondary-fixed text-on-secondary-fixed font-bold text-[10px]">
                      {(assignee.name || '').charAt(0)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {footerRight}
          </div>
        )}
      </div>
    </React.Fragment>
  );

  if (to) {
    return (
      <Link
        ref={ref}
        to={to}
        className={`${cardBaseClasses} ${dragClasses} ${opacityClasses} ${className} block no-underline`}
        {...props}
      >
        {cardContent}
      </Link>
    );
  }

  return (
    <div
      ref={ref}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (onClick) onClick(e); } }}
      className={`${cardBaseClasses} ${dragClasses} ${opacityClasses} ${className}`}
      {...props}
    >
      {cardContent}
    </div>
  );
});

IssueCard.displayName = 'IssueCard';

IssueCard.propTypes = {
  /** Normalized issue object from adapters */
  issue: PropTypes.shape({
    /** Unique identifier (board: issue.id, Jira: issue.key) */
    id: PropTypes.string.isRequired,
    /** Display key (e.g., "PRJ-123", "JIRA-456") */
    key: PropTypes.string,
    /** Display title (board: issue.title, Jira: issue.summary) */
    title: PropTypes.string.isRequired,
    /** Status text for badge display */
    status: PropTypes.string.isRequired,
    /** Type text for badge display */
    type: PropTypes.string.isRequired,
    /** Hex color for top priority/strip */
    stripColor: PropTypes.string.isRequired,
    /** Array of badges to display */
    badges: PropTypes.arrayOf(
      PropTypes.shape({
        text: PropTypes.string.isRequired,
        bgColor: PropTypes.string.isRequired,
        textColor: PropTypes.string.isRequired,
      })
    ).isRequired,
    /** Array of assignee objects */
    assignees: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        avatarUrl: PropTypes.string,
        name: PropTypes.string.isRequired,
      })
    ).isRequired,
    /** Navigation URL (for board issues) */
    to: PropTypes.string,
    /** Click handler (for Jira issues) */
    onClick: PropTypes.func,
    /** Updated at ISO string (for Done card relative date) */
    updatedAt: PropTypes.string,
    /** Whether the issue status is Done */
    done: PropTypes.bool,
    /** Formatted estimate text (e.g. "2h", "3.5h") or null */
    estimateText: PropTypes.string,
  }).isRequired,
  /** Whether the card is currently being dragged */
  isBeingDragged: PropTypes.bool, // eslint-disable-line react/require-default-props
  /** Additional CSS class name */
  className: PropTypes.string, // eslint-disable-line react/require-default-props
};

export default IssueCard;
