import styled from 'styled-components';

import { color, font, fontSizes, lineHeights, sizes, radius, mixin, mixin as mixins } from 'shared/utils/styles';

const paddingLeft = sizes.appNavBarLeftWidth + 24;

export const ProjectPage = styled.div`
  min-height: 100vh;
  padding: 24px 24px 48px ${paddingLeft}px;

  @media (max-width: 1100px) {
    padding: 24px 20px 48px ${paddingLeft}px;
  }
  @media (max-width: 999px) {
    padding-left: ${sizes.appNavBarLeftWidth + 16}px;
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
`;

/* ── Full-width dark top bar ────────────────────────── */
export const TopBar = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 24px;
  background: linear-gradient(135deg, #1c1f2e 0%, #2d2060 100%);
  flex-shrink: 0;
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
`;

export const TopBarTexts = styled.div`
  min-width: 0;
`;

export const TopBarName = styled.div`
  color: #fff;
  ${font.size(fontSizes.body)};
  ${font.bold};
  line-height: ${lineHeights.snug};
  ${mixin.truncateText}
`;

export const TopBarCategory = styled.div`
  color: rgba(255, 255, 255, 0.5);
  ${font.size(fontSizes.caption)};
  line-height: ${lineHeights.normal};
`;

/* ── Row below top bar ──────────────────────────────── */
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
  @media (max-width: 999px) {
    padding: 24px 20px 48px 20px;
  }
`;
