import styled from 'styled-components';

import { color, font, fontSizes, lineHeights, sizes, radius, mixin, media } from 'shared/utils/styles';

export const ProjectPage = styled.div`
  min-height: 100vh;
  padding: 24px 24px 48px ${sizes.appNavBarLeftWidth + 24}px;

  @media (max-width: 1100px) {
    padding: 24px 20px 48px ${sizes.appNavBarLeftWidth + 20}px;
  }
  
  ${media.tablet} {
    padding: ${sizes.mobileTopBarHeight}px 0 0 0;
  }
`;

export const ContentCard = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: calc(100vh - 72px);
  background: #fff;
  border-radius: ${radius.large}px;
  ${mixin.boxShadowCard}
  overflow: hidden;

  ${media.tablet} {
    min-height: calc(100vh - ${sizes.mobileTopBarHeight}px);
    border-radius: 0;
  }
`;

export const TopBar = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 24px;
  background: linear-gradient(135deg, #1c1f2e 0%, #2d2060 100%);
  flex-shrink: 0;

  ${media.tablet} {
    padding: 12px 16px;
    gap: 10px;
  }
`;

export const MobileMenuButton = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  ${media.tablet} {
    display: flex;
  }
`;

export const MobileMenuIcon = styled.div`
  width: 20px;
  height: 14px;
  position: relative;

  span {
    display: block;
    position: absolute;
    height: 2px;
    width: 100%;
    background: #fff;
    border-radius: 2px;
    opacity: 1;
    left: 0;
    transform: rotate(0deg);
    transition: 0.25s ease-in-out;

    &:nth-child(1) {
      top: ${props => props.$isOpen ? '6px' : '0px'};
      transform: ${props => props.$isOpen ? 'rotate(135deg)' : 'rotate(0deg)'};
    }

    &:nth-child(2) {
      top: 6px;
      width: ${props => props.$isOpen ? '0%' : '100%'};
      left: ${props => props.$isOpen ? '50%' : '0%'};
    }

    &:nth-child(3) {
      top: ${props => props.$isOpen ? '6px' : '12px'};
      transform: ${props => props.$isOpen ? 'rotate(-135deg)' : 'rotate(0deg)'};
    }
  }
`;

export const MobileDrawerBackdrop = styled.div`
  display: none;

  ${media.tablet} {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 200;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

export const MobileDrawer = styled.div`
  display: none;

  ${media.tablet} {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 280px;
    max-width: 85vw;
    background: #fff;
    z-index: 201;
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.15);
    transform: translateX(${props => props.$isOpen ? '0' : '-100%'});
    transition: transform 0.3s ease;
    overflow-y: auto;
  }
`;

export const TopBarAvatar = styled.div`
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: ${radius.medium}px;
  background: linear-gradient(135deg, #e879f9 0%, #8b5cf6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);

  ${media.tablet} {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }
`;

export const TopBarTexts = styled.div`
  min-width: 0;
  flex: 1;
`;

export const TopBarName = styled.div`
  color: #fff;
  ${font.size(fontSizes.body)};
  ${font.bold};
  line-height: ${lineHeights.snug};
  ${mixin.truncateText}

  ${media.tablet} {
    ${font.size(fontSizes.bodySmall)};
  }
`;

export const TopBarCategory = styled.div`
  color: rgba(255, 255, 255, 0.5);
  ${font.size(fontSizes.caption)};
  line-height: ${lineHeights.normal};

  ${media.tablet} {
    display: none;
  }
`;

export const BodyRow = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

export const MainContent = styled.main`
  flex: 1;
  min-width: 0;
  padding: 24px 32px 48px 40px;
  ${mixin.scrollableY}
  ${mixin.customScrollbar()}

  @media (max-width: 1100px) {
    padding: 24px 20px 48px 24px;
  }
  
  ${media.tablet} {
    padding: 16px;
    padding-bottom: 32px;
  }
`;

export const MobileActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 8px;
  border-bottom: 1px solid #dde1ec;
`;

export const MobileActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  background: #f8fafc;
  border: none;
  border-radius: ${radius.medium}px;
  font-size: 15px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: background 0.12s;

  &:hover {
    background: #f1f5f9;
  }

  svg {
    flex-shrink: 0;
  }
`;

export const MobileLangSwitcher = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 8px;
  border-top: 1px solid #dde1ec;
  margin-top: auto;
`;

export const MobileLangButton = styled.button`
  padding: 8px 16px;
  min-width: 48px;
  font-size: 13px;
  font-weight: 500;
  color: ${props => props.$active ? color.primary : color.textMedium};
  background: ${props => props.$active ? color.backgroundLightPrimary : 'transparent'};
  border: 1px solid ${props => props.$active ? color.primary : color.borderLightest};
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: ${color.backgroundLight};
    color: ${color.primary};
  }
`;
