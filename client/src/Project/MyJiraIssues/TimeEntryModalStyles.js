import styled from 'styled-components';

import { color, font } from 'shared/utils/styles';

export const ModalContents = styled.div`
  padding: 24px 28px 28px;
`;

export const ModalTitle = styled.h2`
  margin: 0 0 20px;
  ${font.bold}
  ${font.size(20)}
  color: ${color.textDarkest};
`;

export const Field = styled.div`
  margin-bottom: 18px;
`;

export const Label = styled.label`
  display: block;
  margin-bottom: 6px;
  color: ${color.textDark};
  ${font.medium}
  ${font.size(13)}
`;

export const Hint = styled.div`
  margin-top: 6px;
  ${font.size(12)}
  color: ${color.textMedium};
  ${props => props.$error && `color: ${color.danger};`}
`;

export const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid ${color.borderLight};
`;

export const ActionsRight = styled.div`
  display: flex;
  gap: 10px;
`;
