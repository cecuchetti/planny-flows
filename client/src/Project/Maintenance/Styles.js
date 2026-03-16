import styled from 'styled-components';

import { color, font, mixin } from 'shared/utils/styles';

export const Page = styled.div`
  padding: 0 0 40px;
`;

export const PageHeader = styled.div`
  margin-bottom: 24px;
`;

export const PageTitle = styled.h1`
  ${font.bold}
  ${font.size(24)}
  color: ${color.textDarkest};
  margin: 0;
`;

export const ActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-top: 24px;
`;

export const ActionCard = styled.button`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  padding: 20px;
  background: #fff;
  border-radius: 8px;
  border: 2px solid ${color.borderLight};
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;

  &:hover {
    border-color: ${color.primary};
    box-shadow: 0 4px 12px rgba(0, 82, 204, 0.12);
  }

  &:focus {
    outline: none;
    border-color: ${color.primary};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  ${mixin.clickable}
`;

export const CardIconWrap = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  background: ${props => props.$bg || color.backgroundLight};
  color: ${props => props.$color || color.textDark};
`;

export const CardTitle = styled.div`
  ${font.bold}
  ${font.size(16)}
  color: ${color.textDarkest};
  margin-bottom: 6px;
`;

export const CardSubtitle = styled.div`
  ${font.size(13)}
  color: ${color.textMedium};
  line-height: 1.4;
`;

export const HoursStatus = styled.div`
  display: inline-flex;
  align-items: center;
  margin-top: 8px;
  padding: 3px 10px;
  border-radius: 12px;
  ${font.size(12)}
  ${font.medium}
  background: ${props => props.$isComplete ? '#dcfce7' : '#fef3c7'};
  color: ${props => props.$isComplete ? '#166534' : '#92400e'};
  border: 1px solid ${props => props.$isComplete ? '#86efac' : '#fcd34d'};
`;

export const HoursFetchError = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 3px 10px;
  border-radius: 12px;
  ${font.size(12)}
  ${font.medium}
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
`;
