import styled from 'styled-components';

import { color, font, fontSizes, lineHeights, mixin, radius } from 'shared/utils/styles';
import { StyledField, FieldLabel } from 'shared/components/Form/Styles';

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

/** Page chrome. The shell already pads the content, so this only adds rhythm. */
export const Page = styled.div`
  padding: 0 0 40px;
`;

export const PageHeader = styled.div`
  margin-bottom: 20px;
`;

export const PageTitle = styled.h1`
  ${font.bold}
  ${font.size(fontSizes.pageTitle)}
  color: ${color.textDarkest};
  margin: 0 0 6px;
  line-height: ${lineHeights.tight};
`;

export const PageSubtitle = styled.p`
  ${font.size(fontSizes.bodySmall)}
  color: ${color.textMedium};
  margin: 0;
  max-width: 720px;
  line-height: ${lineHeights.relaxed};
`;

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

export const CardTitle = styled.h2`
  ${font.bold}
  ${font.size(fontSizes.sectionTitle)}
  color: ${color.textDarkest};
  margin: 0 0 4px;
  line-height: ${lineHeights.snug};
`;

export const Row = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`;

/** Space between an action and the content above it inside a card. */
export const RowSpaced = styled(Row)`
  margin-top: 12px;
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

/**
 * A list of loan or person cards.
 *
 * The card itself is `ListCard` (an `<article>`, the element the board uses for
 * one issue); the grid lives here so the card keeps its own chrome.
 */
export const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  margin-top: 16px;
`;

/** A loan, a person: one card that reads like a board card, without a status strip. */
export const ListCard = styled.article`
  background: #fff;
  border: 1px solid ${color.borderLightest};
  border-radius: ${radius.medium}px;
  padding: 14px 16px;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;

  &:hover {
    border-color: ${color.violetBorderLight};
    box-shadow: 0 4px 16px ${mixin.rgba(color.statusViolet.text, 0.1)};
  }
`;

export const CardHeader = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
`;

export const CardKey = styled.span`
  ${font.medium}
  ${font.size(fontSizes.caption)}
  color: ${color.textLight};
  letter-spacing: 0.01em;
`;

export const CardAmount = styled.strong`
  ${font.bold}
  ${font.size(fontSizes.body)}
  color: ${color.textDarkest};
`;

/** Pastel chip in the same palette the status badges use. */
export const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: ${radius.pill}px;
  ${font.medium}
  ${font.size(fontSizes.caption)}
  line-height: 1.5;
  white-space: nowrap;
  background: ${color.statusViolet.bg};
  color: ${color.statusViolet.text};
`;

export const MetaRow = styled.div`
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin: 6px 0;
  color: ${color.textDark};
  ${font.size(fontSizes.bodySmall)}
`;

export const MetaLabel = styled.span`
  color: ${color.textMedium};
`;

/** The payment history: a list of rows, each with its own confirmation. */
export const List = styled.ul`
  list-style: none;
  margin: 12px 0 0;
  padding: 0;

  > li + li {
    border-top: 1px solid ${color.borderLightest};
  }
`;

export const ListRow = styled.li`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 0;
  ${font.size(fontSizes.bodySmall)}
  color: ${color.textDark};
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
 * The same field chrome as `Form.Field`, for the one control that is not a Formik
 * value: the borrower picker.
 *
 * `StyledField` and `FieldLabel` are the shared components extended, not copied,
 * so the picker keeps its own request and local state while still lining up with
 * the fields beside it.
 */
export const FieldShell = styled(StyledField)``;

export const FieldLabelText = styled(FieldLabel)``;

/**
 * The area under the picker's dropdown.
 *
 * The dropdown is absolutely positioned, so anything rendered after it sits
 * underneath until it has been pushed clear of the open list.
 */
export const PickerHint = styled.div`
  margin-top: 40px;
`;
