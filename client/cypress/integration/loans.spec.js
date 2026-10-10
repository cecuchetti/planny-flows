const loan = (overrides = {}) => ({
  id: 1,
  number: '00001',
  borrowerId: 7,
  borrower: { id: 7, firstName: 'Lola', lastName: 'Paz' },
  amount: '1500.50',
  advancePaid: '0.00',
  installmentAmount: null,
  pendingBalance: '1500.50',
  currency: 'USD',
  date: '2026-10-07',
  concept: 'Préstamo personal',
  lender: 'Ecuche',
  city: 'Córdoba',
  createdAt: '2026-10-07T12:00:00',
  ...overrides,
});

/*
 * `ConfirmModal` takes its trigger through `renderLink`, which hands you an
 * `open` callback to wire yourself: `renderLink={({ open }) => <Button
 * onClick={open}>…`. Spreading that object onto `Button` instead leaves it with
 * its default no-op `onClick`, so the dialog never appears and the destructive
 * action silently becomes unreachable. The two confirmation cases below are the
 * regression guard for that.
 */
describe('Loans registry', () => {
  let loans;
  let createdLoan;
  let payments;

  const stubApi = () => {
    cy.intercept('GET', '**/api/v1/borrowers*', {
      borrowers: [{ id: 7, firstName: 'Lola', lastName: 'Paz', loanCount: 0 }],
    }).as('borrowers');
    cy.intercept('POST', '**/api/v1/borrowers', {
      borrower: { id: 7, firstName: 'Lola', lastName: 'Paz' },
    }).as('createBorrower');
    cy.intercept('GET', '**/api/v1/loans', (req) => req.reply({ loans })).as('listLoans');
    // Registered before the loan GET on purpose: that glob also matches
    // `/loans/{id}/payments`, so the more specific route has to come first.
    cy.intercept('GET', '**/api/v1/loans/*/payments', (req) => req.reply({ payments })).as(
      'listPayments',
    );
    cy.intercept('POST', '**/api/v1/loans', (req) => {
      const { body } = req;
      createdLoan = loan({
        number: '00009',
        ...body,
        pendingBalance: (Number(body.amount) - Number(body.advancePaid || 0)).toFixed(2),
        advancePaid: Number(body.advancePaid || 0).toFixed(2),
      });
      loans = [createdLoan];
      req.reply({ statusCode: 201, body: { loan: createdLoan } });
    }).as('createLoan');
    cy.intercept('GET', '**/api/v1/loans/*', (req) => {
      if (!createdLoan) return req.continue();
      return req.reply({ loan: createdLoan });
    }).as('getLoan');
    cy.intercept('PUT', '**/api/v1/loans/*', (req) => {
      const { body } = req;
      createdLoan = {
        ...(createdLoan || loan()),
        ...body,
        number: '00042',
        pendingBalance: (
          Number(body.amount) -
          Number(body.advancePaid || 0) -
          payments.reduce((total, item) => total + Number(item.amount), 0)
        ).toFixed(2),
      };
      loans = [createdLoan];
      req.reply({ body: { loan: createdLoan } });
    }).as('updateLoan');
    cy.intercept('DELETE', '**/api/v1/loans/*', (req) => {
      loans = loans.filter((item) => item.id !== createdLoan.id);
      createdLoan = null;
      payments = [];
      req.reply({ statusCode: 204 });
    }).as('deleteLoan');
    // Registered after the loan GET so the more specific history route wins.
    cy.intercept('GET', '**/api/v1/loans/*/payments', (req) => req.reply({ payments })).as(
      'listPayments',
    );
    cy.intercept('POST', '**/api/v1/loans/*/payments', (req) => {
      const amount = Number(req.body.amount);
      const outstanding =
        Number(createdLoan.amount) -
        Number(createdLoan.advancePaid || 0) -
        payments.reduce((total, item) => total + Number(item.amount), 0);
      if (!(amount > 0) || amount > outstanding) {
        return req.reply({
          statusCode: 400,
          body: {
            error: {
              message: 'Revisá los datos del pago.',
              code: 'BAD_USER_INPUT',
              status: 400,
              data: { fields: { amount: 'El pago no puede superar el saldo pendiente.' } },
            },
          },
        });
      }
      const payment = {
        id: payments.length + 1,
        loanId: createdLoan.id,
        amount: amount.toFixed(2),
        date: '2026-10-08T12:00:00',
        createdAt: '2026-10-08T12:00:00',
        snapshot: {},
      };
      payments = [...payments, payment];
      createdLoan = {
        ...createdLoan,
        pendingBalance: (outstanding - amount).toFixed(2),
      };
      loans = [createdLoan];
      return req.reply({ statusCode: 201, body: { payment } });
    }).as('createPayment');
    cy.intercept('DELETE', '**/api/v1/loans/*/payments/*', (req) => {
      const id = Number(req.url.split('/').pop());
      const removed = payments.find((item) => item.id === id);
      payments = payments.filter((item) => item.id !== id);
      if (removed) {
        createdLoan = {
          ...createdLoan,
          pendingBalance: (Number(createdLoan.pendingBalance) + Number(removed.amount)).toFixed(2),
        };
        loans = [createdLoan];
      }
      return req.reply({ statusCode: 204 });
    }).as('deletePayment');
  };

  /**
   * Enter the Préstamos view and wait for the list it fetches on entry.
   *
   * The list refetches whenever the view is entered, so the assertions run
   * against the fixtures assigned just before this call rather than against the
   * empty list the first page load fetched.
   */
  const showLoans = () => {
    // Scoped to the nav: the page heading also reads "Préstamos".
    cy.get('nav').contains('Préstamos').click();
    cy.wait('@listLoans');
  };

  beforeEach(() => {
    loans = [];
    createdLoan = null;
    payments = [];
    stubApi();
    // The guard that matters: no view in this module may reach for Jira.
    cy.intercept('GET', '**/api/v1/jira/**', { statusCode: 500 }).as('jiraRequest');
    cy.visit('/loans');
  });

  it('navigates the five loan views without Jira requests', () => {
    cy.contains('Dashboard').should('be.visible');
    cy.contains('Personas').click();
    cy.contains('Personas').should('be.visible');
    cy.contains('Nuevo Préstamo').click();
    cy.contains('Nuevo Préstamo').should('be.visible');
    cy.contains('Generar Recibo').click();
    cy.contains('Generar Recibo').should('be.visible');
  });

  it('creates a borrower inline from the picker and selects it', () => {
    // This case needs "no matches" for the search the inline flow triggers.
    cy.intercept('GET', '**/api/v1/borrowers*', { borrowers: [] }).as('borrowersEmpty');
    cy.contains('Nuevo Préstamo').click();
    cy.get('input[placeholder="Buscá una persona"]').type('Lola');
    cy.contains('Crear persona').click();
    cy.get('input[placeholder="Nombre"]').type('Lola');
    cy.get('input[placeholder="Apellido"]').type('Paz');
    cy.contains('button', 'Guardar persona').click();
    cy.wait('@createBorrower');
    cy.contains('Persona seleccionada: Lola Paz').should('be.visible');
  });

  it('registers a loan with a live balance preview and lists it', () => {
    cy.contains('Nuevo Préstamo').click();
    cy.get('input[placeholder="Buscá una persona"]').type('Lola');
    cy.contains('button', 'Lola Paz').click();
    cy.get('input[name="amount"]').type('1500.50');
    cy.contains('Saldo pendiente').should('contain', '1500.50 USD');
    cy.get('input[name="advancePaid"]').type('500.25');
    cy.contains('Saldo pendiente').should('contain', '1000.25 USD');
    cy.get('input[name="concept"]').type('Préstamo personal');
    cy.get('input[name="lender"]').type('Ecuche');
    cy.contains('button', 'Guardar préstamo').click();
    cy.wait('@createLoan');

    // The save lands on Préstamos, where the new card is visible.
    cy.wait('@listLoans');
    cy.contains('Nº 00009').should('be.visible');
    cy.contains('1500.50 USD').should('be.visible');
    cy.contains('1000.25 USD').should('be.visible');
    cy.contains('Lola Paz').should('be.visible');
  });

  it('lists existing loans newest first with their derived balance', () => {
    loans = [
      loan({ id: 2, number: '00002', concept: 'Viaje', pendingBalance: '250.00' }),
      loan({ id: 1, number: '00001', concept: 'Préstamo personal' }),
    ];
    showLoans();
    cy.get('article').should('have.length', 2);
    cy.get('article').first().should('contain', 'Nº 00002');
    cy.get('article').first().should('contain', '250.00 USD');
    cy.get('article').first().should('contain', 'Viaje');
  });

  it('opens the edit form prefilled and saves the changes', () => {
    loans = [loan({ id: 1, advancePaid: '500.00', pendingBalance: '1000.50' })];
    [createdLoan] = loans;
    showLoans();
    cy.contains('button', 'Editar').click();
    cy.wait('@getLoan');

    // Edit mode preselects the person and locks the currency once paid ahead.
    cy.contains('Persona seleccionada: Lola Paz').should('be.visible');
    cy.get('select[name="currency"]').should('be.disabled');
    cy.get('input[name="amount"]').clear();
    cy.get('input[name="amount"]').type('2000');
    cy.contains('button', 'Guardar cambios').click();
    cy.wait('@updateLoan');
    cy.wait('@listLoans');
    cy.contains('Nº 00042').should('be.visible');
  });

  it('shows the linked-loan count in Personas', () => {
    cy.intercept('GET', '**/api/v1/borrowers*', {
      borrowers: [{ id: 7, firstName: 'Lola', lastName: 'Paz', loanCount: 3 }],
    }).as('borrowersWithLoans');
    cy.get('nav').contains('Personas').click();
    cy.wait('@borrowersWithLoans');
    cy.contains('Préstamos: 3').should('be.visible');
  });

  it('deletes a loan only after confirming the consequence', () => {
    loans = [loan({ id: 1 })];
    [createdLoan] = loans;
    showLoans();
    cy.contains('Nº 00001').should('be.visible');
    cy.contains('button', 'Eliminar').click();
    cy.get('[data-testid="modal:confirm"]')
      .should('contain', 'Se elimina el préstamo y sus pagos asociados. No se puede deshacer.')
      .find('button')
      .contains('Eliminar')
      .click();
    cy.wait('@deleteLoan');
    cy.wait('@listLoans');
    cy.contains('Todavía no hay préstamos').should('be.visible');
  });

  it('explains why the currency is locked once something was paid', () => {
    loans = [loan({ id: 1, advancePaid: '500.00', pendingBalance: '1000.50' })];
    [createdLoan] = loans;
    showLoans();
    cy.contains('button', 'Editar').click();
    cy.wait('@getLoan');

    cy.get('select[name="currency"]').should('be.disabled');
    cy.contains('No podés cambiar la moneda').should('be.visible');
  });

  it('opens the Personas confirmation dialog', () => {
    cy.intercept('GET', '**/api/v1/borrowers*', {
      borrowers: [{ id: 7, firstName: 'Lola', lastName: 'Paz', loanCount: 0 }],
    }).as('borrowersWithLoans');
    cy.get('nav').contains('Personas').click();
    cy.wait('@borrowersWithLoans');
    cy.contains('button', 'Eliminar').click();
    cy.get('[data-testid="modal:confirm"]').should('exist');
  });

  it('reports a failed history load inside the payment section, with a retry', () => {
    loans = [loan({ id: 1, pendingBalance: '800.00' })];
    [createdLoan] = loans;
    // The first history request fails; the retry is left to the working stub.
    cy.intercept('GET', '**/api/v1/loans/*/payments', (req) => {
      req.reply({ statusCode: 500, body: { error: { code: 'INTERNAL_ERROR', status: 500 } } });
    }).as('paymentsDown');
    showLoans();
    cy.contains('button', 'Editar').click();
    cy.wait('@getLoan');
    cy.wait('@paymentsDown');

    // A failed history must not take the loan form down with it.
    cy.contains('button', 'Guardar cambios').should('be.visible');
    cy.get('input[name="amount"]').should('have.value', '1500.50');
    cy.contains('No pudimos cargar los pagos').should('be.visible');
    cy.contains('Todavía no hay pagos registrados.').should('not.exist');

    // The retry refetches and the failure is replaced by the real state.
    cy.get('@paymentsDown.all').should('have.length', 1);
    cy.contains('button', 'Reintentar').click();
    cy.get('@paymentsDown.all').should('have.length', 2);
  });

  it('registers a payment and refreshes the history and the balance', () => {
    loans = [loan({ id: 1, pendingBalance: '800.00' })];
    [createdLoan] = loans;
    showLoans();
    cy.contains('button', 'Editar').click();
    cy.wait('@getLoan');
    cy.wait('@listPayments');

    // The fixture's 800.00 balance on a 1500.50 loan means 700.50 was already
    // collected. The balance the preview derives from that term is pinned by the
    // `money.test.js` cases; this flow is about the capture itself.
    cy.contains('Todavía no hay pagos registrados.').should('be.visible');
    cy.get('input[name="paymentAmount"]').type('150.00');
    cy.contains('button', 'Registrar pago').click();
    cy.wait('@createPayment');
    cy.wait('@listPayments');

    // The history refetched without a reload: the row, its amount and the
    // running total are the payment that was just registered.
    cy.contains('Total cobrado').should('contain', '150.00 USD');
    cy.get('input[name="paymentAmount"]').should('have.value', '');
    cy.contains('button', 'Eliminar').should('be.visible');
    cy.contains('Todavía no hay pagos registrados.').should('not.exist');
  });

  it('refuses an overpayment and keeps the balance untouched', () => {
    loans = [loan({ id: 1, pendingBalance: '800.00' })];
    [createdLoan] = loans;
    showLoans();
    cy.contains('button', 'Editar').click();
    cy.wait('@getLoan');
    cy.wait('@listPayments');

    cy.get('input[name="paymentAmount"]').type('900.00');
    cy.contains('button', 'Registrar pago').click();

    // The refusal is reported and the loan form is still standing: nothing was
    // written and no page reload happened.
    cy.contains('button', 'Guardar cambios').should('be.visible');
    cy.get('input[name="amount"]').should('have.value', '1500.50');
  });

  it('deletes a payment behind a confirmation and recomputes the balance', () => {
    loans = [loan({ id: 1, pendingBalance: '800.00' })];
    [createdLoan] = loans;
    payments = [
      {
        id: 1,
        loanId: 1,
        amount: '200.00',
        date: '2026-10-08T12:00:00',
        createdAt: '2026-10-08T12:00:00',
        snapshot: {},
      },
    ];
    showLoans();
    cy.contains('button', 'Editar').click();
    cy.wait('@getLoan');
    cy.wait('@listPayments');
    cy.contains('Saldo pendiente').should('contain', '800.00 USD');

    // Instrumented to prove the delete trigger — which lives inside a portal —
    // never submits the register form that sits next to it.
    cy.window().then((win) => {
      /* eslint-disable no-underscore-dangle */
      win.__PAYMENT_POSTS = [];
      const { open } = win.XMLHttpRequest.prototype;
      win.XMLHttpRequest.prototype.open = function instrumented(method, url, ...rest) {
        if (method === 'POST' && String(url).includes('/payments')) {
          win.__PAYMENT_POSTS.push(String(url));
        }
        return open.call(this, method, url, ...rest);
      };
      /* eslint-enable no-underscore-dangle */
    });

    cy.contains('button', 'Eliminar').click();
    cy.get('[data-testid="modal:confirm"]')
      .should('contain', 'Se elimina el pago y el saldo pendiente se recalcula.')
      .find('button')
      .contains('Eliminar')
      .click();
    cy.wait('@deletePayment');
    cy.wait('@listPayments');

    cy.contains('Saldo pendiente').should('contain', '1000.00 USD');
    cy.contains('Todavía no hay pagos registrados.').should('be.visible');
    /* eslint-disable no-underscore-dangle */
    cy.window().its('__PAYMENT_POSTS').should('deep.equal', []);
    /* eslint-enable no-underscore-dangle */
  });
});
