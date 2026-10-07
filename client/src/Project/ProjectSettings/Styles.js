import styled from 'styled-components';

import { color, font, radius } from 'shared/utils/styles';
import { Button, Form } from 'shared/components';

/**
 * Styles for the unified settings page.
 *
 * The page renders inside the application shell, so it carries no page padding of
 * its own. The card chrome around each section comes from the `Accordion`
 * component, so there is no per-section wrapper here.
 */

export const Page = styled.div`
  padding: 0 0 40px;
`;

export const PageHeader = styled.div`
  margin-bottom: 20px;
`;

export const PageTitle = styled.h1`
  ${font.bold}
  ${font.size(24)}
  color: ${color.textDarkest};
  margin: 0 0 6px;
`;

export const PageSubtitle = styled.p`
  ${font.size(14)}
  color: ${color.textMedium};
  margin: 0;
  max-width: 720px;
  line-height: 1.6;
`;

export const Notice = styled.div`
  padding: 12px 16px;
  margin-bottom: 16px;
  border-radius: 8px;
  ${font.size(13)}
  line-height: 1.6;
  background: ${(props) => (props.tone === 'warn' ? '#fffbeb' : color.backgroundLightPrimary)};
  color: ${(props) => (props.tone === 'warn' ? '#92400e' : color.textDark)};
  border-left: 3px solid ${(props) => (props.tone === 'warn' ? color.warning : color.primary)};
`;

/* ── Project details form ─────────────────────────────────────────────────── */

export const FormElement = styled(Form.Element)`
  width: 100%;
  max-width: 640px;
`;

export const ActionButton = styled(Button)`
  margin-top: 20px;
`;

/* ── Runtime setting rows ─────────────────────────────────────────────────── */

export const FieldRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding: 14px 0;

  & + & {
    border-top: 1px solid ${color.borderLightest};
  }

  @media (max-width: 780px) {
    flex-direction: column;
    gap: 8px;
  }
`;

export const FieldMeta = styled.div`
  flex: 0 0 240px;
  min-width: 0;

  @media (max-width: 780px) {
    flex: 1 1 auto;
  }
`;

export const FieldLabel = styled.label`
  display: block;
  ${font.medium}
  ${font.size(14)}
  color: ${color.textDarkest};
  margin-bottom: 2px;
`;

export const FieldKey = styled.code`
  display: block;
  ${font.size(11)}
  color: ${color.textLight};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-bottom: 4px;
`;

export const FieldHelp = styled.p`
  ${font.size(12)}
  color: ${color.textMedium};
  margin: 4px 0 0;
  line-height: 1.5;
`;

export const FieldControl = styled.div`
  flex: 1;
  min-width: 0;
`;

export const BadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
`;

const BADGE_TONES = {
  warn: { bg: '#fef3c7', fg: '#92400e' },
  ok: { bg: color.statusSuccess.bg, fg: color.statusSuccess.text },
  info: { bg: color.backgroundLightPrimary, fg: color.primary },
};

export const Badge = styled.span`
  display: inline-block;
  ${font.size(11)}
  ${font.medium}
  padding: 2px 8px;
  border-radius: ${radius.small}px;
  background: ${(props) => (BADGE_TONES[props.tone] || {}).bg || color.backgroundMedium};
  color: ${(props) => (BADGE_TONES[props.tone] || {}).fg || color.textMedium};
`;

export const PendingValue = styled.div`
  ${font.size(12)}
  color: ${color.textMedium};
  margin-top: 6px;
`;

export const TestLink = styled.button`
  display: inline-block;
  margin-top: 8px;
  ${font.size(12)}
  ${font.medium}
  color: ${color.textLink};
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;

  &:disabled {
    color: ${color.textLight};
    cursor: default;
  }
`;

export const TestResult = styled.div`
  margin-top: 8px;
  ${font.size(12)}
  padding: 8px 12px;
  border-radius: ${radius.small}px;
  background: ${(props) => (props.ok ? color.statusSuccess.bg : '#fee2e2')};
  color: ${(props) => (props.ok ? color.statusSuccess.text : '#991b1b')};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-word;
`;

export const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 16px;
`;

export const SaveHint = styled.span`
  ${font.size(13)}
  color: ${color.textMedium};
`;
