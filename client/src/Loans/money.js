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
 * The derived pending balance: amount minus advance-paid.
 *
 * Payments are not part of this stage; when they arrive they add their own
 * term here and every caller follows.
 */
export const pendingBalancePreview = (amount, advancePaid) => {
  const base = toAmount(amount);
  if (base === null) return null;
  const advance = toAmount(advancePaid) || 0;
  return roundMoney(base - advance);
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
