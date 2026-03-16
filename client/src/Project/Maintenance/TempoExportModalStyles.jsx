import styled from 'styled-components';

import { color, font, fontSizes, lineHeights, radius } from 'shared/utils/styles';

/* ── Modal shell ────────────────────────────────────── */
export const ModalContents = styled.div`
  overflow: hidden;
`;

/* ── Header ─────────────────────────────────────────── */
export const ModalHeader = styled.div`
  background: linear-gradient(135deg, ${color.violetGradientStart} 0%, ${color.violetGradientEnd} 100%);
  border-bottom: 1px solid ${color.violetBorderLight};
  padding: 20px 28px 18px;
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

export const TaskKeyBadge = styled.div`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: ${radius.pill}px;
  background: ${color.statusViolet.bg};
  border: 1px solid ${color.statusViolet.border};
  color: ${color.statusViolet.text};
  ${font.medium}
  ${font.size(fontSizes.caption)}
  line-height: 1.4;
  white-space: nowrap;
  flex-shrink: 0;
`;

export const ModalTitle = styled.h2`
  margin: 0;
  ${font.bold}
  ${font.size(fontSizes.sectionTitle)}
  color: ${color.textDarkest};
  line-height: ${lineHeights.snug};
`;

export const TaskSummary = styled.p`
  margin: 5px 0 0;
  ${font.size(fontSizes.bodySmall)}
  color: ${color.textMedium};
  line-height: ${lineHeights.relaxed};
  font-weight: normal;
`;

/* ── Form body ──────────────────────────────────────── */
export const FormBody = styled.div`
  padding: 28px 32px 28px;
`;

export const Field = styled.div`
  margin-bottom: 20px;
`;

export const Label = styled.label`
  display: block;
  margin-bottom: 8px;
  color: ${color.textDark};
  ${font.medium}
  ${font.size(fontSizes.bodySmall)}
  line-height: ${lineHeights.normal};
`;

export const Hint = styled.div`
  margin-top: 6px;
  ${font.size(fontSizes.caption)}
  color: ${color.textLight};
  line-height: ${lineHeights.normal};
  ${props => props.$error && `color: ${color.danger}; font-weight: 500;`}
`;

export const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding-top: 20px;
  border-top: 1px solid ${color.borderLightest};
`;

export const ActionsRight = styled.div`
  display: flex;
  gap: 8px;
  margin-left: auto;
`;

export const WarningBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin-bottom: 20px;
  background: ${color.statusWarning.bg};
  border: 1px solid ${color.statusWarning.border};
  border-radius: ${radius.button}px;
  color: ${color.statusWarning.text};
  ${font.size(fontSizes.bodySmall)}
  line-height: ${lineHeights.normal};

  .warning-icon {
    font-size: 18px;
    flex-shrink: 0;
  }
`;

/* ── Input wrapper for max-width constraints ─────────── */
export const InputWrapper = styled.div`
  max-width: ${props => props.$maxWidth || '250px'};
`;

export const DatePickerWrapper = styled.div`
  max-width: 250px;
`;

export const DescriptionWrapper = styled.div`
  max-width: 400px;
`;
