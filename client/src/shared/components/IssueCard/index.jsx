import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';

import {
  IssueContainer,
  IssueLink,
  Strip,
  CardBody,
  IssueKey,
  Title,
  BadgeRow,
  StatusBadge,
  Bottom,
  Assignees,
  AssigneeAvatar,
} from './Styles';

const IssueCard = forwardRef(({ issue, isBeingDragged = false, className = '', ...props }, ref) => {
  const {
    key: issueKey,
    title,
    stripColor,
    badges = [],
    assignees = [],
    to,
    onClick,
  } = issue;

  // Determine which wrapper to use
  const ContainerComponent = to ? IssueLink : IssueContainer;
  const containerProps = to ? { to } : { onClick };

  const containerElement = (
    <ContainerComponent
      ref={ref}
      className={className}
      $isBeingDragged={isBeingDragged}
      {...containerProps}
      {...props}
    >
      <Strip $color={stripColor} />
      <CardBody>
        {issueKey && <IssueKey>{issueKey}</IssueKey>}
        <Title title={title}>{title}</Title>
        
        {badges.length > 0 && (
          <BadgeRow>
            {badges.map((badge, index) => (
              <StatusBadge
                key={index}
                $bg={badge.bgColor}
                $text={badge.textColor}
              >
                {badge.text}
              </StatusBadge>
            ))}
          </BadgeRow>
        )}
        
        {assignees.length > 0 && (
          <Bottom>
            <Assignees>
              {assignees.map((assignee, index) => (
                <AssigneeAvatar
                  key={index}
                  size={22}
                  avatarUrl={assignee.avatarUrl}
                  name={assignee.name}
                />
              ))}
            </Assignees>
          </Bottom>
        )}
      </CardBody>
    </ContainerComponent>
  );

  return containerElement;
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
        avatarUrl: PropTypes.string,
        name: PropTypes.string.isRequired,
      })
    ).isRequired,
    /** Navigation URL (for board issues) */
    to: PropTypes.string,
    /** Click handler (for Jira issues) */
    onClick: PropTypes.func,
  }).isRequired,
  /** Whether the card is currently being dragged */
  isBeingDragged: PropTypes.bool, // eslint-disable-line react/require-default-props
  /** Additional CSS class name */
  className: PropTypes.string, // eslint-disable-line react/require-default-props
};



export default IssueCard;