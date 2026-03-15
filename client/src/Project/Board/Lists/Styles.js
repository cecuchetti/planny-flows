import styled from 'styled-components';
import { mixin } from 'shared/utils/styles';

export const Lists = styled.div`
  display: flex;
  margin: 26px -5px 0;
  overflow-x: auto;
  padding-bottom: 8px;
  ${mixin.customScrollbar()}
`;
