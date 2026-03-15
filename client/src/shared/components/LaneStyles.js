import styled from 'styled-components';

import { color, font, mixin } from 'shared/utils/styles';

/** Shared lane/column style for Kanban Board and External Jira Assignments */
export const Lane = styled.div`
  display: flex;
  flex-direction: column;
  margin: 0 5px;
  min-height: 400px;
  border-radius: 3px;
  background: ${color.backgroundLightest};
  flex: ${props => (props.$flexFixed ? '0 0 280px' : '1')};
  min-width: ${props => (props.$flexFixed ? '280px' : '0')};
  width: ${props => (props.$widthPercent ? `${props.$widthPercent}` : 'auto')};
`;

export const LaneTitle = styled.div`
  padding: 13px 10px 17px;
  text-transform: uppercase;
  color: ${color.textMedium};
  ${font.size(12.5)};
  ${mixin.truncateText}
  ${props => props.$dragHandle && mixin.clickable}
`;

export const LaneIssuesCount = styled.span`
  text-transform: lowercase;
  ${font.size(13)};
`;

export const LaneContent = styled.div`
  height: 100%;
  padding: 0 5px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;
