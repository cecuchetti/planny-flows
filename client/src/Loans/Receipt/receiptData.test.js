import {
  currencyLabel,
  receiptAmount,
  receiptData,
  receiptDateParts,
  receiptHistoryRows,
  receiptNumber,
  previewReceiptData,
} from './receiptData';

describe('receiptHistoryRows', () => {
  it('puts the advance line first when the snapshot carried an advance', () => {
    const rows = receiptHistoryRows({
      advancePaid: '200.00',
      paymentsHistory: [{ id: 1, amount: '300.00' }],
    });

    expect(rows).toEqual([
      { kind: 'advance', amount: '200.00', date: null },
      { kind: 'payment', amount: '300.00', date: null, reversedAt: null },
    ]);
  });

  it('omits the advance line when there was no advance', () => {
    const rows = receiptHistoryRows({
      advancePaid: '0.00',
      paymentsHistory: [{ id: 1, amount: '300.00' }],
    });

    expect(rows).toEqual([{ kind: 'payment', amount: '300.00', date: null, reversedAt: null }]);
  });

  it('carries the date the snapshot froze for each payment', () => {
    const rows = receiptHistoryRows({
      advancePaid: '0.00',
      paymentsHistory: [{ id: 1, amount: '300.00', date: '2026-06-24T10:00:00' }],
    });

    expect(rows).toEqual([
      { kind: 'payment', amount: '300.00', date: '2026-06-24T10:00:00', reversedAt: null },
    ]);
  });

  it('keeps a reversed entry with its amount and its mark', () => {
    const rows = receiptHistoryRows({
      advancePaid: '0.00',
      paymentsHistory: [{ id: 1, amount: '300.00', reversedAt: '2026-10-10T12:00:00' }],
    });

    expect(rows).toEqual([
      { kind: 'payment', amount: '300.00', date: null, reversedAt: '2026-10-10T12:00:00' },
    ]);
  });

  it('is empty when there is no snapshot', () => {
    expect(receiptHistoryRows(null)).toEqual([]);
    expect(receiptHistoryRows(undefined)).toEqual([]);
  });
});

describe('receiptDateParts', () => {
  it('splits an ISO timestamp into the three paper cells', () => {
    expect(receiptDateParts('2026-10-05T12:34:56')).toEqual({
      day: '05',
      month: '10',
      year: '2026',
    });
  });

  it('returns blanks for a missing date', () => {
    expect(receiptDateParts('')).toEqual({ day: '', month: '', year: '' });
    expect(receiptDateParts(null)).toEqual({ day: '', month: '', year: '' });
  });
});

describe('receipt formatting', () => {
  it('prefixes the amount with its currency, as the paper form does', () => {
    expect(currencyLabel('ARS')).toBe('ARS $');
    expect(currencyLabel('USD')).toBe('USD $');
    expect(receiptNumber('25000')).toBe('25000.00');
    expect(receiptAmount('25000', 'ARS')).toBe('ARS $ 25000.00');
  });

  it('falls back to an em dash for an amount that is not a number', () => {
    expect(receiptNumber('')).toBe('—');
    expect(receiptAmount(null, 'USD')).toBe('USD $ —');
  });
});

describe('receiptData', () => {
  const loan = {
    number: '00001',
    amount: '1000.00',
    city: 'Córdoba',
    lender: 'Ecuche',
    concept: 'Préstamo personal',
    currency: 'USD',
    borrower: { firstName: 'Lola', lastName: 'Paz' },
  };

  it('renders the amount in words from the payment amount and loan currency', () => {
    const data = receiptData(
      { amount: '1500.50', date: '2026-10-08T12:00:00', snapshot: {} },
      loan,
    );

    expect(data.amountInWords).toBe('mil quinientos dólares con 50/100');
    expect(data.borrowerName).toBe('Lola Paz');
  });

  it('carries the loan principal, so the receipt prints the total lent', () => {
    const data = receiptData({ amount: '250.00', date: '2026-10-08T12:00:00', snapshot: {} }, loan);

    expect(data.loanAmount).toBe('1000.00');
  });

  it('exposes the date cells and the currency label the grid prints', () => {
    const data = receiptData({ amount: '10.00', date: '2026-10-08T12:00:00', snapshot: {} }, loan);

    expect(data.day).toBe('08');
    expect(data.month).toBe('10');
    expect(data.year).toBe('2026');
    expect(data.currencyLabel).toBe('USD $');
  });

  it('reads the resulting balance from the snapshot, not from a later loan edit', () => {
    // The loan was later edited to a different amount, but the receipt must show
    // what the snapshot froze, not the loan's live figures.
    const payment = {
      amount: '250.00',
      date: '2026-10-08T12:00:00',
      snapshot: { pendingBalance: '749.50' },
    };

    const data = receiptData(payment, { ...loan, amount: '9000.00' });

    expect(data.resultingBalance).toBe('749.50');
    expect(data.amount).toBe('250.00');
  });

  it('falls back to empty strings without a payment or loan', () => {
    const data = receiptData(null, null);

    expect(data.borrowerName).toBe('');
    expect(data.amountInWords).toBe('');
    expect(data.loanAmount).toBe('');
    expect(data.resultingBalance).toBe('');
    expect(data.currency).toBe('USD');
  });

  it('surfaces the payment own reversal separately from its history', () => {
    const data = receiptData(
      {
        amount: '250.00',
        date: '2026-10-08T12:00:00',
        reversedAt: '2026-10-09T12:00:00',
        snapshot: {},
      },
      loan,
    );

    expect(data.reversedAt).toBe('2026-10-09T12:00:00');
  });

  it('renders a migrated snapshot whose history amounts are bare JSON numbers', () => {
    // A migrated/recomputed snapshot may store history amounts as bare numbers
    // (the serializer normalizes them for the API), and may omit the advance.
    const data = receiptData(
      {
        amount: '250.00',
        date: '2026-10-08T12:00:00',
        snapshot: {
          pendingBalance: 650.0,
          paymentsHistory: [{ id: 1, amount: 250.0 }],
        },
      },
      loan,
    );

    expect(data.resultingBalance).toBe(650.0);
    expect(data.history).toEqual([
      { kind: 'payment', amount: 250.0, date: null, reversedAt: null },
    ]);
  });

  it('carries the nationalId from the loan', () => {
    const loan = {
      currency: 'USD',
      borrower: { firstName: 'Ana', lastName: 'Gómez', nationalId: '27-38194829-4' },
    };
    const data = receiptData({ amount: '100.00', snapshot: {} }, loan);
    expect(data.nationalId).toBe('27-38194829-4');
    expect(data.borrowerName).toBe('Ana Gómez');
  });

  it('carries installmentsCount and installmentsPaid from the loan', () => {
    const loan = { amount: '5000', installmentsCount: 6, installmentsPaid: 4 };
    const data = receiptData({ amount: '500.00', snapshot: {} }, loan);
    expect(data.installmentsCount).toBe(6);
    expect(data.installmentsPaid).toBe(4);
  });
});

describe('previewReceiptData', () => {
  const loan = {
    number: '0007',
    amount: '150000.00',
    city: 'Córdoba',
    lender: 'VIS',
    concept: 'Préstamo personal',
    currency: 'ARS',
    pendingBalance: '42000.00',
    installmentsCount: 6,
    installmentsPaid: 4,
    borrower: {
      firstName: 'Ana',
      lastName: 'Gómez',
      nationalId: '27-38194829-4',
    },
  };

  it('computes the preview data from loan + draft', () => {
    const data = previewReceiptData(loan, {
      amount: '8000.00',
      date: '2026-11-03',
      concept: 'Préstamo personal Nº 0007 · Amortización Cuota 5/6',
      reference: 'MP-98214',
    });

    expect(data.borrowerName).toBe('Ana Gómez');
    expect(data.nationalId).toBe('27-38194829-4');
    expect(data.city).toBe('Córdoba');
    expect(data.day).toBe('03');
    expect(data.month).toBe('11');
    expect(data.year).toBe('2026');
    expect(data.concept).toBe('Préstamo personal Nº 0007 · Amortización Cuota 5/6');
    expect(data.reference).toBe('MP-98214');
    expect(data.amountInWords).toContain('ocho mil');
    expect(data.installmentsPaid).toBe(5);
    expect(data.installmentsCount).toBe(6);
  });

  it('computes resultingBalance as pendingBalance - draft amount (clamped to 0)', () => {
    const data = previewReceiptData(loan, { amount: '8000.00', date: '2026-11-03' });
    expect(data.resultingBalance).toBe(34000);
  });

  it('clamps resultingBalance to 0 when draft amount exceeds pending balance', () => {
    const data = previewReceiptData(
      { ...loan, pendingBalance: '5000.00' },
      { amount: '8000.00', date: '2026-11-03' },
    );
    expect(data.resultingBalance).toBe(0);
  });

  it('auto-increments installmentsPaid by 1 for the preview', () => {
    const data = previewReceiptData(
      { ...loan, installmentsPaid: 0 },
      { amount: '1000.00', date: '2026-11-03' },
    );
    expect(data.installmentsPaid).toBe(1);
  });

  it('returns empty object when loan or draft is missing', () => {
    expect(previewReceiptData(null, { amount: '100.00' })).toEqual({});
    expect(previewReceiptData(loan, null)).toEqual({});
    expect(previewReceiptData(undefined, undefined)).toEqual({});
  });

  it('uses loan.concept as fallback when draft.concept is empty', () => {
    const data = previewReceiptData(loan, { amount: '100.00', date: '2026-11-03' });
    expect(data.concept).toBe('Préstamo personal');
  });

  it('gives empty amountInWords for invalid amount', () => {
    const data = previewReceiptData(loan, { amount: '', date: '2026-11-03' });
    expect(data.amountInWords).toBe('');
  });
});
