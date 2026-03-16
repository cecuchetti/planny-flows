import styled from 'styled-components';

import { color, font, fontSizes, lineHeights, media } from 'shared/utils/styles';

export const Header = styled.div`
  margin-top: 6px;
  display: flex;
  justify-content: space-between;

  ${media.tablet} {
    margin-top: 4px;
  }
`;

export const BoardName = styled.h1`
  margin: 0;
  color: ${color.textDarkest};
  ${font.size(fontSizes.pageTitle)}
  ${font.bold}
  line-height: ${lineHeights.snug};
  letter-spacing: -0.01em;

  ${media.tablet} {
    ${font.size(18)}
  }
`;
