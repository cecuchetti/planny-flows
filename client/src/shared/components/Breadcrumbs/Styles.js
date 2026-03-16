import styled from 'styled-components';

import { color, font, fontSizes, lineHeights, media } from 'shared/utils/styles';

export const Container = styled.nav`
  color: ${color.textMedium};
  ${font.size(fontSizes.caption)}
  line-height: ${lineHeights.normal};
  ${font.regular}

  ${media.tablet} {
    display: none;
  }
`;

export const Divider = styled.span`
  position: relative;
  top: 1px;
  margin: 0 8px;
  ${font.size(fontSizes.caption)};
  opacity: 0.7;
`;
