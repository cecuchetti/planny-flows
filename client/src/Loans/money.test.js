import {
  CURRENCIES,
  amountWithCurrency,
  formatDate,
  formatLoanNumber,
  pendingBalancePreview,
  roundMoney,
  toAmount,
} from './money';

describe('CURRENCIES', () => {
  it('offers exactly the supported currencies', () => {
    expect(CURRENCIES).toEqual(['USD', 'ARS']);
  });
});

describe('formatLoanNumber', () => {
  it('zero-pads to five digits', () => {
    expect(formatLoanNumber(1)).toBe('00001');
    expect(formatLoanNumber('42')).toBe('00042');
  });

  it('leaves an already-padded value alone', () => {
    expect(formatLoanNumber('00042')).toBe('00042');
  });

  it('is empty when there is no number', () => {
    expect(formatLoanNumber(null)).toBe('');
    expect(formatLoanNumber(undefined)).toBe('');
  });
});

describe('amountWithCurrency', () => {
  it('always carries the currency label', () => {
    expect(amountWithCurrency('1500.5', 'USD')).toBe('1500.50 USD');
    expect(amountWithCurrency(1000, 'ARS')).toBe('1000.00 ARS');
  });

  it('does not invent an amount when the field is empty', () => {
    expect(amountWithCurrency('', 'USD')).toBe('— USD');
  });
});

describe('pendingBalancePreview', () => {
  it('derives amount minus advance-paid', () => {
    expect(pendingBalancePreview('1500.50', '500.25')).toBe(1000.25);
    expect(pendingBalancePreview(1000, '')).toBe(1000);
    expect(pendingBalancePreview('1000', '0')).toBe(1000);
  });

  it('rounds to two decimals', () => {
    expect(pendingBalancePreview('0.1', '0.02')).toBe(0.08);
    expect(pendingBalancePreview('10.005', '0')).toBe(roundMoney(10.005));
  });

  it('stays unknown until an amount is typed', () => {
    expect(pendingBalancePreview('', '')).toBeNull();
    expect(pendingBalancePreview(null, '5')).toBeNull();
  });

  it('treats a non-numeric amount as unknown rather than zero', () => {
    expect(pendingBalancePreview('abc', '0')).toBeNull();
  });
});

describe('toAmount', () => {
  it('keeps an explicit zero distinct from an empty field', () => {
    expect(toAmount(0)).toBe(0);
    expect(toAmount('0')).toBe(0);
    expect(toAmount('')).toBeNull();
    expect(toAmount(null)).toBeNull();
  });
});

describe('formatDate', () => {
  it('renders an ISO date in day/month/year order', () => {
    expect(formatDate('2026-10-07')).toBe('07/10/2026');
  });

  it('is empty without a date', () => {
    expect(formatDate(null)).toBe('');
  });
});
