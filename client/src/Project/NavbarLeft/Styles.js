import styled from 'styled-components';
import { NavLink } from 'react-router-dom';

import { font, fontSizes, lineHeights, sizes, color, mixin, zIndexValues, media } from 'shared/utils/styles';
import { Logo } from 'shared/components';

export const NavLeft = styled.aside`
  z-index: ${zIndexValues.navLeft};
  position: fixed;
  top: 0;
  left: 0;
  overflow-x: hidden;
  height: 100vh;
  width: ${sizes.appNavBarLeftWidth}px;
  background: #fff;
  border-right: 1px solid ${color.borderLightest};
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: width 0.2s ease, box-shadow 0.2s ease;
  ${mixin.hardwareAccelerate}
  &:hover {
    width: 200px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }

  ${media.tablet} {
    display: none;
  }
`;

export const LogoLink = styled(NavLink)`
  display: block;
  position: relative;
  left: 0;
  margin: 20px 0 10px;
  transition: left 0.1s;
`;

export const StyledLogo = styled(Logo)`
  display: inline-block;
  margin-left: 8px;
  padding: 10px;
  ${mixin.clickable}
`;

export const Bottom = styled.div`
  position: absolute;
  bottom: 20px;
  left: 0;
  width: 100%;
`;

export const LangSwitcher = styled.div`
  display: flex;
  align-items: center;
  padding-left: 64px;
  height: 42px;
  gap: 4px;
  ${NavLeft}:hover & {
    padding-left: 18px;
  }
`;

export const LangButton = styled.button`
  padding: 4px 8px;
  min-width: 32px;
  color: ${color.textMedium};
  background: transparent;
  border: 1px solid ${color.borderLightest};
  border-radius: 6px;
  ${font.size(fontSizes.caption)}
  line-height: 1;
  ${mixin.clickable}
  &:hover {
    background: ${color.backgroundLight};
    color: ${color.primary};
  }
  &.active {
    background: ${color.backgroundLightPrimary};
    border-color: ${color.primary};
    color: ${color.primary};
  }
`;

export const Item = styled.div`
  position: relative;
  width: 100%;
  height: 42px;
  line-height: 42px;
  padding-left: 64px;
  color: ${color.textDark};
  transition: color 0.15s, background 0.15s;
  ${mixin.clickable}
  border: none;
  text-align: left;
  &:hover {
    background: ${color.backgroundLight};
    color: ${color.primary};
  }
  i {
    position: absolute;
    left: 18px;
    color: inherit;
  }
`;

export const ItemText = styled.div`
  position: relative;
  right: 12px;
  visibility: hidden;
  opacity: 0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  transition: all 0.15s;
  transition-property: right, visibility, opacity;
  ${font.medium}
  ${font.size(fontSizes.caption)}
  line-height: ${lineHeights.normal};
  ${NavLeft}:hover & {
    right: 0;
    visibility: visible;
    opacity: 1;
  }
`;
