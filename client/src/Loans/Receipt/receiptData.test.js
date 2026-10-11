import { receiptData, receiptHistoryRows } from './receiptData';

describe('receiptHistoryRows', () => {
  it('puts the advance line first when the snapshot carried an advance', () => {
    const rows = receiptHistoryRows({
      advancePaid: '200.00',
      paymentsHistory: [{ id: 1, amount: '300.00' }],
    });

    expect(rows).toEqual([
      { kind: 'advance', amount: '200.00' },
      { kind: 'payment', amount: '300.00', reversedAt: null },
    ]);
  });

  it('omits the advance line when there was no advance', () => {
    const rows = receiptHistoryRows({
      advancePaid: '0.00',
      paymentsHistory: [{ id: 1, amount: '300.00' }],
    });

    expect(rows).toEqual([{ kind: 'payment', amount: '300.00', reversedAt: null }]);
  });

  it('keeps a reversed entry with its amount and its mark', () => {
    const rows = receiptHistoryRows({
      advancePaid: '0.00',
      paymentsHistory: [{ id: 1, amount: '300.00', reversedAt: '2026-10-10T12:00:00' }],
    });

    expect(rows).toEqual([
      { kind: 'payment', amount: '300.00', reversedAt: '2026-10-10T12:00:00' },
    ]);
  });

  it('is empty when there is no snapshot', () => {
    expect(receiptHistoryRows(null)).toEqual([]);
    expect(receiptHistoryRows(undefined)).toEqual([]);
  });
});

describe('receiptData', () => {
  const loan = {
    number: '00001',
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
    expect(data.history).toEqual([{ kind: 'payment', amount: 250.0, reversedAt: null }]);
  });
});
