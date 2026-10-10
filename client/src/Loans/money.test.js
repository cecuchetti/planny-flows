import {
  CURRENCIES,
  amountWithCurrency,
  collectedFromLoan,
  formatDate,
  formatLoanNumber,
  paymentsTotal,
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

  it('subtracts the payments term when one is given', () => {
    expect(pendingBalancePreview('1000', '100', '250')).toBe(650);
    expect(pendingBalancePreview('1000', '100')).toBe(900);
  });
});

describe('paymentsTotal', () => {
  it('adds every registered payment', () => {
    expect(paymentsTotal([{ amount: '250.00' }, { amount: '25.50' }])).toBe(275.5);
  });

  it('is zero without payments', () => {
    expect(paymentsTotal([])).toBe(0);
    expect(paymentsTotal(undefined)).toBe(0);
  });
});

describe('collectedFromLoan', () => {
  it('recovers the collected total from the server balance', () => {
    expect(
      collectedFromLoan({ amount: '1000.00', advancePaid: '100.00', pendingBalance: '650.00' }),
    ).toBe(250);
  });

  it('is zero when nothing was collected', () => {
    expect(
      collectedFromLoan({ amount: '1000.00', advancePaid: '0.00', pendingBalance: '1000.00' }),
    ).toBe(0);
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
