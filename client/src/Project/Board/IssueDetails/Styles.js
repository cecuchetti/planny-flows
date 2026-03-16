import styled from 'styled-components';

import { color, font, fontSizes, lineHeights, media } from 'shared/utils/styles';

export const Content = styled.div`
  display: flex;
  padding: 0 30px 60px;

  ${media.tablet} {
    flex-direction: column;
    padding: 0 16px 40px;
  }
`;

export const Left = styled.div`
  width: 65%;
  padding-right: 50px;

  ${media.tablet} {
    width: 100%;
    padding-right: 0;
  }
`;

export const Right = styled.div`
  width: 35%;
  padding-top: 5px;

  ${media.tablet} {
    width: 100%;
    padding-top: 16px;
    border-top: 1px solid ${color.borderLightest};
    margin-top: 16px;
  }
`;

export const TopActions = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 21px 18px 0;

  ${media.tablet} {
    padding: 12px 8px 0;
  }
`;

export const TopActionsRight = styled.div`
  display: flex;
  align-items: center;
  & > * {
    margin-left: 4px;
  }
`;

export const SectionTitle = styled.h2`
  margin: 24px 0 8px;
  padding: 0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: ${color.textDark};
  ${font.size(fontSizes.caption)};
  ${font.bold};
  line-height: ${lineHeights.tight};
`;
