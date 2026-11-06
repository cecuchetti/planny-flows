/*
 * The receipt's display model, derived from the payment's frozen snapshot and
 * the loan's current descriptive fields.
 *
 * Kept as a pure module (no React) so the one part of the receipt that has to be
 * faithful — the historical rendering — is unit-tested rather than only looked
 * at. The balances, the history and the advance line come from the snapshot; the
 * city, number, lender, concept and borrower name come from the loan as it reads
 * today, exactly as the plan's boundary states.
 *
 * A second entrypoint, `previewReceiptData`, computes the display model from
 * unconsumed draft values for the live preview mode (before the payment is
 * registered).
 */
import { amountInWords } from '../amountInWords';
import { roundMoney, toAmount } from '../money';

export const borrowerFullName = (loan) => {
  const borrower = loan && loan.borrower;
  if (!borrower) return '';
  return `${borrower.firstName || ''} ${borrower.lastName || ''}`.trim();
};

/** The prefix the legacy receipt prints before an amount ("ARS $" / "USD $"). */
export const currencyLabel = (currency) => (currency === 'ARS' ? 'ARS $' : 'USD $');

/** The two-decimal figure alone, without the currency prefix. */
export const receiptNumber = (amount) => {
  const parsed = toAmount(amount);
  return parsed === null ? '—' : roundMoney(parsed).toFixed(2);
};

/**
 * An amount as the receipt prints it: the currency prefix, then two decimals.
 */
export const receiptAmount = (amount, currency) =>
  `${currencyLabel(currency)} ${receiptNumber(amount)}`;

/**
 * The three date cells the receipt's first row splits a date into.
 */
export const receiptDateParts = (value) => {
  const [year, month, day] = String(value || '')
    .slice(0, 10)
    .split('-');
  if (!year || !month || !day) return { day: '', month: '', year: '' };
  return { day, month, year };
};

/**
 * The payment history a receipt shows, in reading order.
 */
export const receiptHistoryRows = (snapshot) => {
  const rows = [];
  const advancePaid = toAmount(snapshot && snapshot.advancePaid) || 0;
  if (advancePaid > 0) {
    rows.push({ kind: 'advance', amount: snapshot.advancePaid, date: null });
  }
  for (const entry of (snapshot && snapshot.paymentsHistory) || []) {
    rows.push({
      kind: 'payment',
      amount: entry.amount,
      date: entry.date || null,
      reversedAt: entry.reversedAt || null,
    });
  }
  return rows;
};

/**
 * Everything the receipt renders, resolved from its two inputs.
 *
 * This is the ISSSUED mode: the payment has been registered and its snapshot is
 * frozen. The payment amount is the receipt's amount, and the resulting balance
 * comes from the snapshot.
 */
export const receiptData = (payment, loan) => {
  const snapshot = (payment && payment.snapshot) || {};
  const currency = (loan && loan.currency) || 'USD';
  const date = (payment && payment.date) || '';
  return {
    city: (loan && loan.city) || '',
    number: (loan && loan.number) || '',
    currency,
    currencyLabel: currencyLabel(currency),
    date,
    ...receiptDateParts(date),
    amount: (payment && payment.amount) || '',
    amountInWords: amountInWords(payment && payment.amount, currency),
    lender: (loan && loan.lender) || '',
    concept: (loan && loan.concept) || '',
    borrowerName: borrowerFullName(loan),
    nationalId: (loan && loan.borrower && loan.borrower.nationalId) || '',
    loanAmount: (loan && loan.amount) || '',
    reversedAt: (payment && payment.reversedAt) || null,
    resultingBalance:
      snapshot.pendingBalance === undefined || snapshot.pendingBalance === null
        ? ''
        : snapshot.pendingBalance,
    history: receiptHistoryRows(snapshot),
    /** Installments info from loan (post-payment snapshot may already have updated it). */
    installmentsCount: (loan && loan.installmentsCount) || (loan && loan.installmentCount) || 0,
    installmentsPaid: (loan && loan.installmentsPaid) || 0,
  };
};

/**
 * Receipt data for the LIVE PREVIEW mode — before the payment is registered.
 *
 * The draft values (amount, date, concept, reference, number) come from the form
 * and are combined with the loan's current descriptive fields to simulate what
 * the issued receipt will look like.
 *
 * @param {object} loan  The selected loan (descriptive fields).
 * @param {object} draft  Draft form values: { amount, date, concept, reference, number }.
 * @returns {object} Shape compatible with receiptData's output.
 */
export const previewReceiptData = (loan, draft) => {
  if (!loan || !draft) return {};
  const currency = loan.currency || 'USD';
  const date = draft.date || '';
  const amount = draft.amount || '';
  const pendingBalance = toAmount(loan.pendingBalance) || 0;
  const paid = (loan.installmentsPaid || 0) + 1;

  // The "resulting balance" after this hypothetical payment
  const resultingBalance = Math.max(pendingBalance - (toAmount(amount) || 0), 0);

  return {
    city: loan.city || '',
    number: loan.number || '',
    currency,
    currencyLabel: currencyLabel(currency),
    date,
    ...receiptDateParts(date),
    amount,
    amountInWords: amountInWords(amount, currency),
    lender: loan.lender || '',
    concept: draft.concept || loan.concept || '',
    reference: draft.reference || '',
    borrowerName: borrowerFullName(loan),
    nationalId: (loan.borrower && loan.borrower.nationalId) || '',
    loanAmount: loan.amount || '',
    reversedAt: null,
    resultingBalance,
    history: [], // No payment history in preview mode
    installmentsCount: loan.installmentsCount || loan.installmentCount || 0,
    installmentsPaid: paid,
  };
};
