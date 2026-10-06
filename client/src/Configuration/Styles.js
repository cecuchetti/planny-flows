import styled from 'styled-components';

import { color } from 'shared/utils/styles';

export const Page = styled.div`
  padding: 32px 40px 80px;
  max-width: 900px;
  margin: 0 auto;
`;

export const Heading = styled.h1`
  font-size: 24px;
  font-weight: 500;
  color: ${color.textDarkest};
  margin-bottom: 4px;
`;

export const Subheading = styled.p`
  font-size: 14px;
  color: ${color.textMedium};
  margin-bottom: 24px;
`;

export const GroupSection = styled.section`
  margin-bottom: 32px;
`;

export const GroupHeading = styled.h2`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: ${color.textMedium};
  padding-bottom: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid ${color.borderLightest};
`;

export const FieldRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid ${color.borderLightest};
`;

export const FieldMeta = styled.div`
  flex: 0 0 240px;
  padding-top: 8px;
`;

export const FieldLabel = styled.label`
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: ${color.textDarkest};
  margin-bottom: 2px;
`;

export const FieldKey = styled.code`
  display: block;
  font-size: 11px;
  color: ${color.textLight};
  font-family: monospace;
`;

export const FieldHelp = styled.p`
  font-size: 12px;
  color: ${color.textMedium};
  margin-top: 4px;
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

export const Badge = styled.span`
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 3px;
  background: ${(props) => (props.tone === 'warn' ? '#FFF4E5' : color.backgroundLight)};
  color: ${(props) => (props.tone === 'warn' ? '#B25E09' : color.textMedium)};
`;

export const PendingValue = styled.div`
  font-size: 12px;
  color: ${color.textMedium};
  margin-top: 6px;
`;

export const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  position: sticky;
  bottom: 0;
  padding: 16px 0;
  background: ${color.backgroundLightest};
  border-top: 1px solid ${color.borderLightest};
`;

export const SaveHint = styled.span`
  font-size: 13px;
  color: ${color.textMedium};
`;

export const Notice = styled.div`
  padding: 12px 16px;
  margin-bottom: 24px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.6;
  background: ${(props) => (props.tone === 'warn' ? '#FFF4E5' : color.backgroundLight)};
  color: ${(props) => (props.tone === 'warn' ? '#B25E09' : color.textDark)};
  border-left: 3px solid ${(props) => (props.tone === 'warn' ? '#F0A04B' : color.primary)};
`;

export const TestResult = styled.div`
  margin-top: 8px;
  font-size: 12px;
  padding: 8px 12px;
  border-radius: 4px;
  background: ${(props) => (props.ok ? '#E9F7EF' : '#FDECEA')};
  color: ${(props) => (props.ok ? '#1E7B45' : '#B3261E')};
  font-family: monospace;
  word-break: break-word;
`;

export const TestLink = styled.button`
  display: inline-block;
  margin-top: 8px;
  font-size: 12px;
  color: ${color.primary};
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;

  &:disabled {
    color: ${color.textLight};
    cursor: default;
  }
`;
