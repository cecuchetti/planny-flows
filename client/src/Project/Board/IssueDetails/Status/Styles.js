import styled, { css } from 'styled-components';

import { issueStatusColors, issueStatusBackgroundColors, mixin } from 'shared/utils/styles';

export const Status = styled.div`
  transition: all 0.15s;
  ${props => mixin.tag(issueStatusBackgroundColors[props.$color], issueStatusColors[props.$color])}
  ${props =>
    props.$isValue &&
    css`
      padding: 0 14px;
      height: 28px;
      font-size: 13px;
      &:hover {
        opacity: 0.88;
        transform: scale(1.03);
      }
    `}
`;
