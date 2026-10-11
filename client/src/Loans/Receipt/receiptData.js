/*
 * The receipt's display model, derived from the payment's frozen snapshot and
 * the loan's current descriptive fields.
 *
 * Kept as a pure module (no React) so the one part of the receipt that has to be
 * faithful — the historical rendering — is unit-tested rather than only looked
 * at. The balances, the history and the advance line come from the snapshot; the
 * city, number, lender, concept and borrower name come from the loan as it reads
 * today, exactly as the plan's boundary states.
 */
import { amountInWords } from '../amountInWords';
import { toAmount } from '../money';

export const borrowerFullName = (loan) => {
  const borrower = loan && loan.borrower;
  if (!borrower) return '';
  return `${borrower.firstName || ''} ${borrower.lastName || ''}`.trim();
};

/**
 * The payment history a receipt shows, in reading order.
 *
 * The advance-paid line comes first, then each payment in the frozen history. A
 * payment the snapshot names as reversed keeps its amount and carries the mark,
 * so a re-issued receipt can say a collection was reversed without rewriting it.
 */
export const receiptHistoryRows = (snapshot) => {
  const rows = [];
  const advancePaid = toAmount(snapshot && snapshot.advancePaid) || 0;
  if (advancePaid > 0) {
    rows.push({ kind: 'advance', amount: snapshot.advancePaid });
  }
  for (const entry of (snapshot && snapshot.paymentsHistory) || []) {
    rows.push({
      kind: 'payment',
      amount: entry.amount,
      reversedAt: entry.reversedAt || null,
    });
  }
  return rows;
};

/**
 * Everything the receipt renders, resolved from its two inputs.
 *
 * The amount in words is the payment amount in the loan's currency; the
 * resulting balance is the snapshot's own, never the loan's live balance.
 */
export const receiptData = (payment, loan) => {
  const snapshot = (payment && payment.snapshot) || {};
  return {
    city: (loan && loan.city) || '',
    number: (loan && loan.number) || '',
    currency: (loan && loan.currency) || 'USD',
    date: (payment && payment.date) || '',
    amount: (payment && payment.amount) || '',
    amountInWords: amountInWords(payment && payment.amount, loan && loan.currency),
    lender: (loan && loan.lender) || '',
    concept: (loan && loan.concept) || '',
    borrowerName: borrowerFullName(loan),
    // The payment's own reversal, distinct from a reversed entry inside its
    // frozen history: a reversed collection must not claim "Recibí la suma de…".
    reversedAt: (payment && payment.reversedAt) || null,
    resultingBalance:
      snapshot.pendingBalance === undefined || snapshot.pendingBalance === null
        ? ''
        : snapshot.pendingBalance,
    history: receiptHistoryRows(snapshot),
  };
};
