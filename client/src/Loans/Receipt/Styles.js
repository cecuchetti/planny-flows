import styled, { createGlobalStyle } from 'styled-components';

import { color, font, fontSizes, lineHeights, radius } from 'shared/utils/styles';

/*
 * The print isolation. A receipt is the one surface that has to reach the paper
 * alone: navigation, buttons and the rest of the app are hidden, and only the
 * element carrying `.planny-receipt` stays visible, positioned at the top of the
 * page. It lives as a global style because the visibility switch has to reach
 * ancestors outside the receipt's own subtree.
 */
export const ReceiptPrintStyles = createGlobalStyle`
  @media print {
    body * {
      visibility: hidden !important;
    }
    .planny-receipt,
    .planny-receipt * {
      visibility: visible !important;
    }
    .planny-receipt {
      /*
       * "fixed", not "absolute": the historical receipt renders inside a Modal
       * portal whose overlay is position: fixed and its panel position:
       * relative, so absolute would resolve against the modal and print the
       * receipt centered/clipped instead of at the top of the paper.
       */
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      border: none !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
  }
`;

/** The formal document, the node the PNG export captures and the print target. */
export const ReceiptPaper = styled.section`
  max-width: 640px;
  margin: 16px 0;
  padding: 28px 30px;
  background: #fff;
  border: 1px solid ${color.borderLightest};
  border-radius: ${radius.medium}px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  color: ${color.textDarkest};
  ${font.size(fontSizes.body)}
  line-height: ${lineHeights.relaxed};
`;

export const ReceiptTitle = styled.h3`
  ${font.bold}
  ${font.size(fontSizes.sectionTitle)}
  margin: 0 0 4px;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.02em;
`;

export const ReceiptMeta = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin: 12px 0 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${color.borderLightest};
  ${font.size(fontSizes.bodySmall)}
  color: ${color.textDark};
`;

/** One label : value line of the body. */
export const ReceiptField = styled.div`
  display: flex;
  gap: 8px;
  margin: 8px 0;
`;

export const ReceiptLabel = styled.span`
  ${font.medium}
  color: ${color.textMedium};
  white-space: nowrap;
`;

export const ReceiptValue = styled.span`
  color: ${color.textDarkest};
`;

/** The amount in words, the formal core of the document. */
export const ReceiptWords = styled.p`
  ${font.medium}
  margin: 10px 0;
  font-style: italic;
`;

/** The blank area the lender signs on the printed copy. */
export const SignatureBox = styled.div`
  margin: 18px 0 8px;
  min-height: 72px;
  border-bottom: 1px solid ${color.textDark};
`;

export const SignatureCaption = styled.p`
  ${font.size(fontSizes.caption)}
  color: ${color.textMedium};
  margin: 4px 0 0;
`;

export const HistoryTitle = styled.h4`
  ${font.bold}
  ${font.size(fontSizes.body)}
  margin: 18px 0 6px;
`;

export const HistoryList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  ${font.size(fontSizes.bodySmall)}

  > li + li {
    border-top: 1px solid ${color.borderLightest};
  }
`;

export const HistoryRow = styled.li`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
`;

export const HistoryLabel = styled.span`
  color: ${color.textDark};
`;

export const HistoryAmount = styled.span`
  color: ${color.textDarkest};
`;

export const ReversedChip = styled.span`
  margin-left: 8px;
  ${font.medium}
  ${font.size(fontSizes.caption)}
  color: ${color.danger};
`;

/**
 * The prominent banner across the top of a reversed payment's receipt: the
 * collection was undone, so the paper must not read as a valid proof of payment.
 */
export const ReversedBanner = styled.div`
  margin-bottom: 16px;
  padding: 10px 14px;
  border: 1px solid ${color.statusError.border};
  border-radius: ${radius.medium}px;
  background: ${color.statusError.bg};
  color: ${color.statusError.text};
  ${font.medium}
  ${font.size(fontSizes.bodySmall)}
`;
