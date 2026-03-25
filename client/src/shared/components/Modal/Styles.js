import styled, { css } from 'styled-components';

import { color, mixin, zIndexValues, radius, media } from 'shared/utils/styles';
import Icon from 'shared/components/Icon';

export const ScrollOverlay = styled.div`
  z-index: ${zIndexValues.modal};
  position: fixed;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  ${mixin.scrollableY}
`;

export const ClickableOverlay = styled.div`
  min-height: 100%;
  background: rgba(15, 23, 42, 0.35);
  ${props => clickOverlayStyles[props.$variant]}
`;

const clickOverlayStyles = {
  center: css`
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 50px;

    ${media.tablet} {
      padding: 16px;
    }
  `,
  aside: '',
};

export const StyledModal = styled.div`
  display: inline-block;
  position: relative;
  width: 100%;
  background: #fff;
  ${props => modalStyles[props.$variant]}
`;

const modalStyles = {
  center: css`
    max-width: ${props => props.$width}px;
    vertical-align: middle;
    border-radius: ${radius.large}px;
    ${mixin.boxShadowCard}

    ${media.tablet} {
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 32px);
    }
  `,
  aside: css`
    min-height: 100vh;
    max-width: ${props => props.$width}px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 10px -5px rgba(0, 0, 0, 0.04);

    ${media.tablet} {
      max-width: 100vw;
    }
  `,
};

const closeButtonStyles = {
  center: css`
    top: 12px;
    right: 14px;
    padding: 6px;
    border-radius: ${radius.medium}px;
    &:hover {
      background: ${color.backgroundLight};
    }

    ${media.tablet} {
      top: 8px;
      right: 8px;
    }
  `,
  aside: css`
    top: 12px;
    right: -32px;
    width: 48px;
    height: 48px;
    padding-top: 10px;
    border-radius: ${radius.medium}px;
    text-align: center;
    background: #fff;
    border: 1px solid ${color.borderLightest};
    ${mixin.boxShadowMedium};
    &:hover {
      color: ${color.primary};
    }

    ${media.tablet} {
      right: 8px;
      width: 40px;
      height: 40px;
    }
  `,
};

export const CloseButton = styled.button`
  position: absolute;
  font-size: 25px;
  color: ${color.textMedium};
  transition: all 0.1s;
  ${mixin.clickable}
  border: none;
  background: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  ${props => closeButtonStyles[props.$variant]}
  &:hover {
    color: ${color.textDarkest};
  }
`;

export const CloseIcon = styled(Icon)`
  font-size: inherit;
  color: inherit;
`;
