export const CURRENCIES = ['USD', 'ARS'];

export const CURRENCY_LABELS = { USD: 'USD', ARS: 'ARS' };

/**
 * Parse anything the amount fields can hold into a number.
 *
 * `null` and an empty string are not zero: they are "nothing typed yet", which
 * the preview has to tell apart from an explicit 0 so it can stay blank instead
 * of claiming a balance of 0.
 */
export const toAmount = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

/** Round to two decimals, the same precision the API stores. */
export const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const amountWithCurrency = (amount, currency) => {
  const parsed = toAmount(amount);
  if (parsed === null) return `— ${currency}`;
  return `${roundMoney(parsed).toFixed(2)} ${currency}`;
};

/**
 * The derived pending balance: amount minus advance-paid minus the payments.
 *
 * `paymentsTotal` is an optional third term so the new-loan form (which has no
 * payments yet) can call this without one. In edit mode the API's own
 * `pendingBalance` is already net of every payment, so the preview must be built
 * from that figure rather than from this function — passing the loaded payments
 * here would subtract them twice.
 */
export const pendingBalancePreview = (amount, advancePaid, paymentsTotal = 0) => {
  const base = toAmount(amount);
  if (base === null) return null;
  const advance = toAmount(advancePaid) || 0;
  const collected = toAmount(paymentsTotal) || 0;
  return roundMoney(base - advance - collected);
};

/**
 * Everything collected on a loan and still in force.
 *
 * A reversed payment keeps its row in the history but is not collected money any
 * more, so it is left out here — the same way the server leaves it out of the
 * `pendingBalance` this view previews from.
 */
export const paymentsTotal = (payments) => {
  if (!Array.isArray(payments)) return 0;
  return roundMoney(
    payments.reduce(
      (total, payment) => total + (payment?.reversedAt ? 0 : toAmount(payment?.amount) || 0),
      0,
    ),
  );
};

/**
 * Everything the derived balance nets out beyond the advance, recovered from the
 * server's own figures: the payments plus any written-off amount.
 *
 * The API's `pendingBalance` is `amount - advancePaid - payments - writtenOff`,
 * so solving for the deducted term gives `payments + writtenOff` even when the
 * operator has unsaved edits in the amount field — which is why it must not be
 * recomputed from the stored amount. The write-off is folded in on purpose: for
 * a closed loan the balance is zero and the write-off is exactly what was
 * condoned, so the preview still reads `0.00` without a separate write-off term.
 */
export const collectedFromLoan = (loan) => {
  if (!loan) return 0;
  const amount = toAmount(loan.amount) || 0;
  const advance = toAmount(loan.advancePaid) || 0;
  const balance = toAmount(loan.pendingBalance) || 0;
  return roundMoney(Math.max(amount - advance - balance, 0));
};

/** The zero-padded five-digit loan number, kept as text so `00001` survives. */
export const formatLoanNumber = (number) => {
  if (number === null || number === undefined || number === '') return '';
  if (typeof number === 'string' && !/^\d+$/.test(number.trim())) return number;
  return String(number).trim().padStart(5, '0');
};

export const formatDate = (value) => {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
};
