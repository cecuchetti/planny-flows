import {
  borrowerCopy,
  dashboardCopy,
  loanCopy,
  loanFormCopy,
  loansListCopy,
  paymentsCopy,
  receiptCopy,
  receiptFlowCopy,
} from './copy';

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

  it('names the reversal instead of a deletion, and says it is undoable', () => {
    expect(paymentsCopy.reverse).toBe('Revertir');
    expect(paymentsCopy.reversedTag).toBe('Revertido');
    expect(paymentsCopy.reverseMessage).toContain('deja de contar para el saldo');
    expect(paymentsCopy.reverseMessage).toContain('Podés deshacer');
    expect(paymentsCopy.undoReversal).toBe('Deshacer');
    // The payment is not removed, so no copy may promise that it is.
    expect(paymentsCopy.remove).toBeUndefined();
    expect(paymentsCopy.removed).toBeUndefined();
    expect(paymentsCopy.removeMessage).toBeUndefined();
  });

  it('carries a Spanish message for every load failure', () => {
    expect(loanFormCopy.loadError).toContain('No pudimos cargar');
    expect(paymentsCopy.loadError).toContain('No pudimos cargar');
    expect(loansListCopy.loadError).toContain('No pudimos cargar');
    expect(borrowerCopy.loadError).toContain('No pudimos cargar');
    expect(dashboardCopy.loadError).toContain('No pudimos cargar');
  });

  it('labels the Resumen dashboard and its metric rows', () => {
    expect(dashboardCopy.title).toBe('Resumen');
    expect(dashboardCopy.empty).toContain('Todavía no hay datos');
    expect(dashboardCopy.principal).toBe('Prestado');
    expect(dashboardCopy.collected).toBe('Cobrado');
    expect(dashboardCopy.outstanding).toBe('Pendiente');
    expect(dashboardCopy.writtenOff).toBe('Condonado');
    expect(dashboardCopy.recoveryRate).toContain('recuperación');
    expect(dashboardCopy.collectedThisMonth).toBe('Cobrado del mes');
    expect(dashboardCopy.nearCompletionTitle).toContain('completarse');
    expect(dashboardCopy.recentActivityTitle).toContain('Actividad');
  });

  it('labels the Activos/Cerrados split and the lifecycle actions', () => {
    expect(loansListCopy.activeTitle).toBe('Activos');
    expect(loansListCopy.closedTitle).toBe('Cerrados');
    expect(loansListCopy.close).toBe('Cerrar');
    expect(loansListCopy.reopen).toBe('Reabrir');
    expect(loansListCopy.closeMessage('700.00 USD')).toContain('Se condonará el saldo pendiente');
    expect(loansListCopy.closePaidMessage).toContain('No hay saldo pendiente');
  });

  it('explains why a closed loan locks its balance fields', () => {
    expect(loanFormCopy.closedNotice).toContain('Reabrilo');
    expect(loanFormCopy.closedNotice).toContain('monto');
  });

  it('carries the formal receipt register and the voseo receipt-flow copy', () => {
    expect(receiptCopy.title).toBe('Recibo de pago');
    expect(receiptCopy.advanceLine).toBe('Pago cuotas anteriores');
    expect(receiptCopy.approved).toBe('Aprobado');
    expect(receiptCopy.signature).toBe('Firma de recibido');
    expect(receiptFlowCopy.title).toBe('Generar Recibo');
    expect(receiptFlowCopy.closedToast).toContain('quedó cerrado');
    expect(loansListCopy.generateReceipt).toBe('Generar Recibo');
    expect(paymentsCopy.viewReceipt).toBe('Ver Recibo');
  });
});
