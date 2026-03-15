import styled, { css } from 'styled-components';
import { Link } from 'react-router-dom';

import { color, font, fontSizes, lineHeights, mixin, radius } from 'shared/utils/styles';
import { Avatar } from 'shared/components';

/* Priority → top strip color */
export const priorityStripColor = {
  5: '#ef4444', // Highest — red
  4: '#f97316', // High — orange
  3: '#eab308', // Medium — yellow
  2: '#14b8a6', // Low — teal
  1: '#94a3b8', // Lowest — slate
};

export const IssueLink = styled(Link)`
  display: block;
  text-decoration: none;
`;

export const Issue = styled.div`
  background: #fff;
  border-radius: ${radius.medium}px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: box-shadow 0.15s, border-color 0.15s, transform 0.12s;
  ${mixin.clickable}

  &:hover {
    border-color: #c4b5fd;
    box-shadow: 0 4px 16px rgba(109, 40, 217, 0.10);
    transform: translateY(-1px);
  }

  ${props =>
    props.isBeingDragged &&
    css`
      transform: rotate(1.5deg) translateY(-2px);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
      border-color: #a78bfa;
    `}
`;

/* Colored accent strip at the top of each card */
export const PriorityStrip = styled.div`
  height: 4px;
  background: ${props => priorityStripColor[props.$priority] || '#e5e7eb'};
  width: 40%;
  border-radius: 0 0 4px 0;
`;

export const CardBody = styled.div`
  padding: 11px 13px 10px;
`;

export const IssueKey = styled.div`
  margin: 0 0 5px;
  color: ${color.textLight};
  ${font.size(fontSizes.caption)};
  ${font.medium};
  line-height: ${lineHeights.tight};
  letter-spacing: 0.01em;
`;

export const Title = styled.p`
  margin: 0 0 10px;
  color: ${color.textDarkest};
  ${font.size(fontSizes.bodySmall)};
  ${font.regular};
  font-weight: 400;
  line-height: ${lineHeights.snug};
`;

/* Status badge row */
export const BadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
`;

export const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  ${font.size(fontSizes.caption)};
  ${font.medium};
  line-height: 1.5;
  background: ${props => props.$bg || '#f3f4f6'};
  color: ${props => props.$text || '#374151'};
`;

export const Bottom = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const Assignees = styled.div`
  display: flex;
  flex-direction: row-reverse;
`;

export const AssigneeAvatar = styled(Avatar)`
  margin-left: -4px;
  box-shadow: 0 0 0 2px #fff;
`;
