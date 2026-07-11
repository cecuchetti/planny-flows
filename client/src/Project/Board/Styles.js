import styled from 'styled-components';

import { color, font } from 'shared/utils/styles';

export const SelectAtLeastOne = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  color: ${color.textMedium};
  ${font.size(15)}
  text-align: center;
`;
