import styled from 'styled-components';

import { font } from 'shared/utils/styles';

export const ProjectFilterWrapper = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
`;

export const ChipsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

export const Chip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 12px;
  border-radius: 20px;
  border: 1px solid;
  cursor: pointer;
  outline: none;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  ${font.size(13)}

  background: ${(props) => (props.$selected ? '#ede9fe' : '#f8fafc')};
  border-color: ${(props) => (props.$selected ? '#c4b5fd' : '#e2e8f0')};
  color: ${(props) => (props.$selected ? '#6d28d9' : '#64748b')};

  &:hover {
    background: ${(props) => (props.$selected ? '#e4dcfb' : '#f1f5f9')};
    border-color: ${(props) => (props.$selected ? '#a78bfa' : '#cbd5e1')};
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px rgba(109, 40, 217, 0.3);
  }
`;

export const ChipIcon = styled.span`
  font-size: 13px;
  line-height: 1;
`;

export const ChipLabel = styled.span`
  white-space: nowrap;
`;
