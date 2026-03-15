import styled from 'styled-components';

import { color, font, mixin, radius } from 'shared/utils/styles';
import { Avatar } from 'shared/components';

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

/* ── Card — matches Kanban board cards exactly ──────── */
export const Card = styled.div`
  background: #fff;
  border-radius: ${radius.medium}px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s, border-color 0.15s, transform 0.12s;
  ${mixin.clickable}

  &:hover {
    border-color: #c4b5fd;
    box-shadow: 0 4px 16px rgba(109, 40, 217, 0.10);
    transform: translateY(-1px);
  }
`;

/* Colored accent strip at top — uses status color */
export const CardStrip = styled.div`
  height: 4px;
  width: 40%;
  border-radius: 0 0 4px 0;
  background: ${props => props.$color || '#e5e7eb'};
`;

export const CardBody = styled.div`
  padding: 11px 13px 10px;
`;

export const CardKey = styled.div`
  ${font.medium}
  ${font.size(12)}
  color: ${color.textLight};
  margin-bottom: 5px;
  line-height: 1.2;
  letter-spacing: 0.01em;
`;

export const CardSummary = styled.div`
  ${font.regular}
  font-weight: 400;
  ${font.size(14)}
  color: ${color.textDarkest};
  margin-bottom: 10px;
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
  gap: 5px;
`;

export const CardStatus = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  background: ${props => props.$bg || color.backgroundMedium};
  color: ${props => props.$text || color.textDark};
  ${font.size(12)}
  ${font.medium}
  line-height: 1.5;
  letter-spacing: 0.01em;
  white-space: nowrap;
`;

export const CardHours = styled.span`
  ${font.medium}
  color: ${color.textDark};
`;

export const CardBottom = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-top: 8px;
`;

export const CardAssigneeAvatar = styled(Avatar)`
  box-shadow: 0 0 0 2px #fff;
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
