import { borrowerCopy, loanCopy, loanFormCopy, loansListCopy, paymentsCopy } from './copy';

/*
 * Préstamos is a view of the project now, so there is no `loanNavigation` to
 * pin: the host sidebar owns navigation and `Loans/index.jsx` owns the three
 * links between its own sub-views. What is worth pinning is the copy the views
 * and the Cypress flows read — a key renamed or emptied there breaks both.
 */
describe('loan copy', () => {
  it('labels the page and the sub-views linked from it', () => {
    expect(loanCopy.title).toBe('Préstamos');
    expect([loanCopy.loans, loanCopy.borrowers, loanCopy.newLoan]).toEqual([
      'Préstamos',
      'Personas',
      'Nuevo Préstamo',
    ]);
  });

  it('labels the person directory', () => {
    expect(borrowerCopy.title).toBe('Personas');
    expect(borrowerCopy.add).toBe('Agregar persona');
  });

  it('keeps the list copy the flows assert on', () => {
    expect(loansListCopy.empty).toBe('Todavía no hay préstamos. Cargá el primero.');
    expect(loansListCopy.number).toBe('Nº');
    expect(loansListCopy.balance).toBe('Saldo pendiente');
  });

  it('explains the currency lock in Spanish', () => {
    expect(paymentsCopy.currencyLocked).toContain('No podés cambiar la moneda');
  });

  it('carries a Spanish message for every load failure', () => {
    expect(loanFormCopy.loadError).toContain('No pudimos cargar');
    expect(paymentsCopy.loadError).toContain('No pudimos cargar');
    expect(loansListCopy.loadError).toContain('No pudimos cargar');
    expect(borrowerCopy.loadError).toContain('No pudimos cargar');
  });
});
