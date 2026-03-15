import styled from 'styled-components';

import { font, fontSizes, lineHeights } from 'shared/utils/styles';
import { Button, Form } from 'shared/components';

export const FormCont = styled.div`
  display: flex;
  justify-content: center;
`;

export const FormElement = styled(Form.Element)`
  width: 100%;
  max-width: 640px;
`;

export const FormHeading = styled.h1`
  margin: 0;
  padding: 6px 0 15px;
  ${font.size(fontSizes.pageTitle)}
  ${font.bold}
  line-height: ${lineHeights.snug};
`;

export const ActionButton = styled(Button)`
  margin-top: 30px;
`;
