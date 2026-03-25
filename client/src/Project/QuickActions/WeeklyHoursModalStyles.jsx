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
  position: relative;
`;

/* ── Loading overlay ────────────────────────────────── */
export const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  z-index: 10;
`;

/* ── Week Grid ──────────────────────────────────────── */
export const WeekGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  margin-bottom: 20px;

  @media (max-width: 600px) {
    grid-template-columns: repeat(4, 1fr);
  }

  @media (max-width: 400px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

/* ── Day Card ───────────────────────────────────────── */
export const DayCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  background: ${props => {
    if (props.$isFuture) return color.backgroundMedium;
    if (props.$isPast) return color.backgroundLightest;
    if (props.$isToday) return color.backgroundLightPrimary;
    return color.backgroundLightest;
  }};
  border-radius: ${radius.medium}px;
  border: 2px solid ${props => {
    if (props.$isToday) return color.primary;
    return 'transparent';
  }};
  opacity: ${props => props.$isFuture ? 0.6 : 1};
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: ${props => props.$isFuture ? 'none' : 'translateY(-2px)'};
    box-shadow: ${props => props.$isFuture ? 'none' : '0 4px 12px rgba(0, 0, 0, 0.08)'};
  }
`;

export const DayHeader = styled.div`
  text-align: center;
  margin-bottom: 8px;
`;

export const DayName = styled.div`
  ${font.medium}
  ${font.size(fontSizes.overline)}
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${props => props.$isToday ? color.primary : color.textMedium};
`;

export const DayDate = styled.div`
  ${font.bold}
  ${font.size(20)}
  color: ${props => props.$isToday ? color.primary : color.textDarkest};
  line-height: 1.2;
`;

/* ── Hours Input ────────────────────────────────────── */
export const HoursInput = styled.input`
  width: 100%;
  max-width: 60px;
  padding: 8px 4px;
  text-align: center;
  border: 2px solid ${props => props.$isEditing ? color.primary : color.borderLight};
  border-radius: ${radius.small}px;
  ${font.medium}
  ${font.size(fontSizes.body)}
  color: ${color.textDarkest};
  background: ${color.backgroundLightest};
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:focus {
    outline: none;
    border-color: ${color.primary};
    box-shadow: 0 0 0 3px rgba(59, 108, 240, 0.15);
  }

  &:disabled {
    background: ${color.backgroundMedium};
    cursor: not-allowed;
    opacity: 0.7;
  }

  /* Hide number input spinners */
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &[type=number] {
    -moz-appearance: textfield;
  }
`;

export const DayLoading = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 4px;
`;

/* ── Status Badge ───────────────────────────────────── */
export const StatusBadge = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: ${radius.pill}px;
  ${font.size(10)}
  ${font.medium}
  white-space: nowrap;

  ${props => {
    switch (props.$status) {
      case 'complete':
        return `
          background: ${color.statusSuccess.bg};
          color: ${color.statusSuccess.text};
          border: 1px solid ${color.statusSuccess.border};
        `;
      case 'inProgress':
        return `
          background: ${color.statusWarning.bg};
          color: ${color.statusWarning.text};
          border: 1px solid ${color.statusWarning.border};
        `;
      case 'incomplete':
      default:
        return `
          background: ${color.statusError.bg};
          color: ${color.statusError.text};
          border: 1px solid ${color.statusError.border};
        `;
    }
  }}
`;

/* ── Total Row ──────────────────────────────────────── */
export const TotalRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: ${color.backgroundLightest};
  border-radius: ${radius.medium}px;
  border: 1px solid ${color.borderLightest};
  margin-bottom: 20px;
`;

export const TotalLabel = styled.div`
  ${font.medium}
  ${font.size(fontSizes.body)}
  color: ${color.textDark};
`;

export const TotalValue = styled.div`
  ${font.bold}
  ${font.size(20)}
  color: ${props => props.$isComplete ? color.success : color.textDarkest};
  display: flex;
  align-items: center;
  gap: 8px;

  .check-icon {
    color: ${color.success};
    font-size: 16px;
  }
`;

/* ── Actions ────────────────────────────────────────── */
export const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding-top: 20px;
  border-top: 1px solid ${color.borderLightest};
`;

export const ActionsRight = styled.div`
  display: flex;
  gap: 8px;
  margin-left: auto;
`;
