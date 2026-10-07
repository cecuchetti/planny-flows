import styled from 'styled-components';

import { color, font, mixin, radius } from 'shared/utils/styles';

export const Wrapper = styled.section`
  background: ${color.backgroundLightest};
  border: 1px solid ${color.borderLightest};
  border-radius: ${radius.medium}px;
  overflow: hidden;

  & + & {
    margin-top: 12px;
  }
`;

export const Header = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 18px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  ${mixin.clickable}

  &:hover {
    background: ${color.backgroundLight};
  }

  &:focus-visible {
    outline: 2px solid ${color.borderInputFocus};
    outline-offset: -2px;
  }
`;

export const Chevron = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: ${color.textMedium};
  transition: transform 0.15s ease;
  transform: rotate(${(props) => (props.$isOpen ? '0deg' : '-90deg')});
`;

export const Titles = styled.span`
  flex: 1;
  min-width: 0;
`;

export const Title = styled.span`
  display: block;
  ${font.bold}
  ${font.size(15)}
  color: ${color.textDarkest};
`;

export const Subtitle = styled.span`
  display: block;
  ${font.size(12)}
  color: ${color.textMedium};
  margin-top: 2px;
`;

const BADGE_TONES = {
  warn: { bg: '#fef3c7', fg: '#92400e' },
  ok: { bg: color.statusSuccess.bg, fg: color.statusSuccess.text },
  info: { bg: color.backgroundLightPrimary, fg: color.primary },
};

export const Badge = styled.span`
  flex-shrink: 0;
  ${font.size(11)}
  ${font.medium}
  padding: 3px 9px;
  border-radius: ${radius.pill}px;
  background: ${(props) => (BADGE_TONES[props.tone] || {}).bg || color.backgroundMedium};
  color: ${(props) => (BADGE_TONES[props.tone] || {}).fg || color.textMedium};
`;

export const Panel = styled.div`
  padding: 4px 18px 18px;
  border-top: 1px solid ${color.borderLightest};
`;
