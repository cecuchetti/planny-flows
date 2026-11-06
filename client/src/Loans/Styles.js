import styled from 'styled-components';

import { color, font, fontSizes, lineHeights, radius } from 'shared/utils/styles';

// Legacy styled-components — being phased out in favor of Tailwind. Only keep what is still imported.

/**
 * The handful of shapes Préstamos needs that the shared components do not
 * provide: the page header, a card, a row and a muted line.
 *
 * There is deliberately no palette, no input and no button here. Préstamos is a
 * view of the project, so its controls are `Form`/`Form.Field`, `Input`,
 * `Select`, `DatePicker`, `Button`, `ConfirmModal` and `toast` — the same ones
 * Kanban Board uses. Everything below is built from the tokens in
 * `shared/utils/styles` rather than from hex values of its own, so the module
 * changes colour and type with the rest of the product.
 */

/** One section of the page: the card chrome the settings page gets from `Accordion`. */
export const Section = styled.section`
  background: #fff;
  border: 1px solid ${color.borderLightest};
  border-radius: ${radius.medium}px;
  padding: 18px 20px 20px;
  margin-bottom: 16px;
  max-width: 720px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
`;

export const Row = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`;

export const Muted = styled.span`
  color: ${color.textMedium};
  ${font.size(fontSizes.bodySmall)}
`;

export const ErrorText = styled.p`
  color: ${color.danger};
  ${font.size(fontSizes.bodySmall)}
  margin: 8px 0;
`;

/** An empty state, in the same muted voice as the meta lines. */
export const EmptyState = styled.p`
  color: ${color.textMedium};
  ${font.size(fontSizes.bodySmall)}
  margin: 12px 0 0;
  line-height: ${lineHeights.relaxed};
`;

/** The error under a field the shared `Form.Field` does not own (the picker). */
export const FieldErrorText = styled.div`
  margin-top: 6px;
  color: ${color.danger};
  ${font.medium}
  ${font.size(fontSizes.caption)}
`;

/**
 * The area under the picker's dropdown.
 *
 * The dropdown is absolutely positioned, so anything rendered after it sits
 * underneath until it has been pushed clear of the open list.
 */
export const PickerHint = styled.div`
  margin-top: 40px;
`;
