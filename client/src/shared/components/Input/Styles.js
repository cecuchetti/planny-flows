import styled, { css } from 'styled-components';

import { color, font, fontSizes, radius } from 'shared/utils/styles';
import Icon from 'shared/components/Icon';

export const StyledInput = styled.div`
  position: relative;
  display: inline-block;
  height: 40px;
  width: 100%;
`;

export const InputElement = styled.input`
  height: 100%;
  width: 100%;
  padding: 0 12px;
  border-radius: ${radius.small}px;
  border: 1.5px solid ${color.borderLightest};
  color: ${color.textDarkest};
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
  ${font.regular}
  ${font.size(fontSizes.body)}
  ${props => props.hasIcon && 'padding-left: 38px;'}
  &:hover {
    border-color: ${color.borderLight};
  }
  &:focus {
    background: #fff;
    border-color: ${color.borderInputFocus};
    box-shadow: 0 0 0 3px ${color.borderInputFocus}22;
    outline: none;
  }
  ${props =>
    props.invalid &&
    css`
      &,
      &:focus {
        border-color: ${color.danger};
        box-shadow: 0 0 0 3px ${color.danger}18;
      }
    `}
`;

export const StyledIcon = styled(Icon)`
  position: absolute;
  top: 8px;
  left: 8px;
  pointer-events: none;
  color: ${color.textMedium};
`;
