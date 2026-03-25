import styled from 'styled-components';

import { color, font, fontSizes, lineHeights, mixin, radius, media } from 'shared/utils/styles';

export const List = styled.div`
  display: flex;
  flex-direction: column;
  margin: 0 6px;
  min-height: 400px;
  width: ${props => (props.$fullWidth ? '100%' : '25%')};
  border-radius: ${radius.medium}px;
  background: transparent;

  ${media.tablet} {
    flex-shrink: 0;
    width: 280px;
    min-width: 280px;
  }
`;

export const Title = styled.div`
  padding: 12px 4px 10px;
  color: ${color.textDarkest};
  ${font.size(fontSizes.body)};
  ${font.bold};
  line-height: ${lineHeights.snug};
  ${mixin.truncateText}
  letter-spacing: -0.01em;
`;

export const IssuesCount = styled.span`
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

export const Issues = styled.div`
  height: 100%;
  padding: 0 2px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;
