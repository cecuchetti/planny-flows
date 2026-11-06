import { createGlobalStyle } from 'styled-components';

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
