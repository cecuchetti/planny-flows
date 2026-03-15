import styled from 'styled-components';

import { color, font, fontSizes, lineHeights, mixin, radius } from 'shared/utils/styles';

/** Shared lane/column style for Kanban Board and External Jira Assignments */
export const Lane = styled.div`
  display: flex;
  flex-direction: column;
  margin: 0 6px;
  min-height: 400px;
  border-radius: ${radius.medium}px;
  background: transparent;
  flex: ${props => (props.$flexFixed ? '0 0 310px' : '1')};
  min-width: ${props => (props.$flexFixed ? '310px' : '0')};
  width: ${props => (props.$widthPercent ? `${props.$widthPercent}` : 'auto')};
`;

export const LaneTitle = styled.div`
  padding: 12px 4px 10px;
  color: ${color.textDarkest};
  ${font.size(fontSizes.body)};
  ${font.bold};
  line-height: ${lineHeights.snug};
  ${mixin.truncateText}
  letter-spacing: -0.01em;
  ${props => props.$dragHandle && mixin.clickable}
`;

export const LaneIssuesCount = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: ${color.backgroundLight};
  color: ${color.textMedium};
  ${font.size(fontSizes.caption)};
  ${font.medium};
  margin-left: 6px;
`;

export const LaneContent = styled.div`
  height: 100%;
  padding: 0 2px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;
