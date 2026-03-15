import styled from 'styled-components';

import { color, font, mixin } from 'shared/utils/styles';

export const Page = styled.div`
  padding: 0 0 40px;
`;

export const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
`;

export const PageTitle = styled.h1`
  ${font.bold}
  ${font.size(24)}
  color: ${color.textDarkest};
  margin: 0;
`;

export const ColumnsWrap = styled.div`
  display: flex;
  margin: 26px -5px 0;
  overflow-x: auto;
  padding-bottom: 8px;
  ${mixin.customScrollbar()}
`;

export const Card = styled.a`
  display: block;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid ${color.borderLight};
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s, border-color 0.15s;

  &:hover {
    border-color: ${color.primary};
    box-shadow: 0 4px 12px rgba(0, 82, 204, 0.12);
  }
  ${mixin.clickable}
`;

export const CardKey = styled.div`
  ${font.medium}
  ${font.size(13)}
  color: ${color.primary};
  margin-bottom: 6px;
`;

export const CardSummary = styled.div`
  ${font.size(15)}
  color: ${color.textDark};
  margin-bottom: 8px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

export const CardMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  ${font.size(12)}
  color: ${color.textMedium};
`;

export const CardStatus = styled.span`
  padding: 2px 8px;
  border-radius: 4px;
  background: ${props => props.$bg || color.backgroundLight};
  color: ${props => props.$text || color.textDark};
`;

export const CardHours = styled.span`
  ${font.medium}
  color: ${color.textDark};
`;

export const LoaderWrap = styled.div`
  padding: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

export const Empty = styled.div`
  padding: 40px 20px;
  text-align: center;
  ${font.size(15)}
  color: ${color.textMedium};
`;

export const ErrorMessage = styled.div`
  padding: 16px;
  background: ${color.danger}14;
  border-radius: 8px;
  ${font.size(14)}
  color: ${color.danger};
`;
