import styled from 'styled-components';
import { NavLink } from 'react-router-dom';

import { color, sizes, font, fontSizes, lineHeights, mixin, radius, media } from 'shared/utils/styles';

const NAV_TEXT    = '#292a2e';
const ACTIVE_BG   = '#eaecf4';
const ACTIVE_TEXT = '#292a2e';
const ACTIVE_ICON = '#5c6bc0';
const HOVER_BG    = '#eef0f5';

export const Sidebar = styled.aside`
  flex-shrink: 0;
  width: ${sizes.secondarySideBarWidth}px;
  padding: 12px 8px 24px;
  background: #f0f2f5;
  border-right: 1px solid #dde1ec;
  display: flex;
  flex-direction: column;
  ${mixin.scrollableY}
  ${mixin.customScrollbar()}

  ${props => props.$isMobile && `
    width: 100%;
    border-right: none;
    padding-top: 0;
  `}

  @media (max-width: 1100px) {
    width: ${sizes.secondarySideBarWidth - 10}px;
  }
  
  ${media.tablet} {
    display: ${props => props.$isMobile ? 'flex' : 'none'};
  }
`;

export const MobileHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 14px;
  background: linear-gradient(135deg, #1c1f2e 0%, #2d2060 100%);
  color: #fff;
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 8px;
`;

/* kept for import compatibility */
export const ProjectInfo = styled.div``;
export const ProjectAvatar = styled.div``;
export const ProjectTexts = styled.div``;
export const ProjectName = styled.div``;
export const ProjectCategory = styled.div``;

/* ── Nav wrapper ────────────────────────────────────── */
export const NavSection = styled.div``;

/* ── Section label ──────────────────────────────────── */
export const SectionLabel = styled.div`
  padding: 16px 10px 4px;
  color: ${color.textLight};
  ${font.size(fontSizes.overline)};
  ${font.medium};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  line-height: ${lineHeights.tight};
`;

export const Divider = styled.div`
  margin: 8px 6px;
  border-top: 1px solid #dde1ec;
`;

/* ── Nav items ──────────────────────────────────────── */
export const LinkItem = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: ${radius.medium}px;
  text-decoration: none;
  color: ${NAV_TEXT};
  transition: background 0.12s;
  ${mixin.clickable}

  &:hover {
    background: ${HOVER_BG};
  }

  &.active {
    background: ${ACTIVE_BG};
    color: ${ACTIVE_TEXT};

    svg, span[role="img"] {
      color: ${ACTIVE_ICON};
    }
  }

  ${media.tablet} {
    padding: 14px 16px;
  }
`;

export const DisabledItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: ${radius.medium}px;
  color: ${NAV_TEXT};
  opacity: 0.38;
  cursor: not-allowed;
`;

/* ── App-style icon square ──────────────────────────── */
export const NavIcon = styled.span`
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: ${props => props.$bg || '#e2e8f0'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.15);
`;

export const LinkText = styled.span`
  font-size: 15px;
  font-weight: 500;
  line-height: 1.5;
  color: ${NAV_TEXT};
  letter-spacing: 0.005em;
  -webkit-font-smoothing: antialiased;
`;
