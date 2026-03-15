import styled from 'styled-components';

import { color, font, fontSizes, lineHeights } from 'shared/utils/styles';

export const Content = styled.div`
  display: flex;
  padding: 0 30px 60px;
`;

export const Left = styled.div`
  width: 65%;
  padding-right: 50px;
`;

export const Right = styled.div`
  width: 35%;
  padding-top: 5px;
`;

export const TopActions = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 21px 18px 0;
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
