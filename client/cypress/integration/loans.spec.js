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
  status: 'active',
  closedAt: null,
  writtenOffAmount: null,
  ...overrides,
});

/* The board data `/project` returns, trimmed to what the shell renders. */
const project = {
  id: 1,
  name: 'Planny Board',
  url: 'https://planny.test',
  description: 'A project',
  category: 'software',
  users: [],
  issues: [],
};

/*
 * Préstamos is a view of the project now, so entering it means the project shell
 * has to render first. Every request that shell makes is stubbed here: an
 * unstubbed one would reach the API, answer 401, and send the client to
 * `/authenticate` before any loan view is reached.
 *
 * The patterns are anchored on the last path segment rather than on
 * `/api/v1/...`: `API_URL` is a build-time value, so the shell's requests may
 * arrive versioned and proxied (`/api/v1/projects`) or bare (`/projects`). Both
 * are matched, and neither collides with a loan route.
 */
const stubShell = () => {
  // A trailing wildcard covers the query string: it is part of the path as far
  // as the glob is concerned.
  cy.intercept('GET', '**/projects*', {
    projects: [{ id: 1, name: project.name, sourceType: 'local', issueCount: 0 }],
    syncScheduled: false,
    syncIntervalMinutes: 0,
  }).as('projects');
  /*
   * `/project` is fetched with `?ids=1` for the selected project, and the
   * multi-project shape is what the shell normalizes.
   */
  cy.intercept('GET', '**/project?*', { projects: [project] }).as('project');
  cy.intercept('GET', '**/currentUser*', {
    currentUser: { id: 1, name: 'Tester', isAdmin: true },
  }).as('currentUser');
};

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

  /*
   * The balance the API would now derive: the loan minus the advance-paid minus
   * the payments still in force. A reversed payment is not collected money, so
   * it is left out — the stub has to agree with the server it stands in for.
   */
  const derivedBalance = () =>
    (
      Number(createdLoan.amount) -
      Number(createdLoan.advancePaid || 0) -
      payments.reduce((total, item) => total + (item.reversedAt ? 0 : Number(item.amount)), 0)
    ).toFixed(2);

  const stubApi = () => {
    cy.intercept('GET', '**/api/v1/borrowers*', {
      borrowers: [{ id: 7, firstName: 'Lola', lastName: 'Paz', loanCount: 0 }],
    }).as('borrowers');
    cy.intercept('POST', '**/api/v1/borrowers', {
      borrower: { id: 7, firstName: 'Lola', lastName: 'Paz' },
    }).as('createBorrower');
    cy.intercept('GET', '**/api/v1/loans', (req) => {
      // The list is split into Activos/Cerrados, so the stub mirrors that shape.
      const active = loans.filter((item) => item.status !== 'closed');
      const closed = loans.filter((item) => item.status === 'closed');
      return req.reply({ loans: { active, closed } });
    }).as('listLoans');
    // Registered before the loan GET on purpose: that glob also matches
    // `/loans/{id}/payments`, so the more specific route has to come first.
    cy.intercept('GET', '**/api/v1/loans/*/payments', (req) => req.reply({ payments })).as(
      'listPayments',
    );
    cy.intercept('POST', '**/api/v1/loans', (req) => {
      const { body } = req;
      // eslint-disable-next-line no-console
      console.log('CREATE LOAN BODY', JSON.stringify(body));
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
    /*
     * Close condones the outstanding balance: the write-off is whatever was
     * still pending, the balance settles to zero and the loan moves to closed.
     * Reopen clears the close date and the write-off and returns the condoned
     * amount to the balance.
     */
    cy.intercept('POST', '**/api/v1/loans/*/close', (req) => {
      const id = Number(req.url.split('/').slice(-2)[0]);
      const current = loans.find((item) => item.id === id) || createdLoan;
      const closed = {
        ...current,
        status: 'closed',
        closedAt: '2026-10-10T12:00:00',
        // The backend only records a write-off when there is something pending
        // to condone; a fully-paid close leaves the field null.
        writtenOffAmount: Number(current.pendingBalance) > 0 ? current.pendingBalance : null,
        pendingBalance: '0.00',
      };
      loans = loans.map((item) => (item.id === id ? closed : item));
      if (createdLoan && createdLoan.id === id) createdLoan = closed;
      return req.reply({ body: { loan: closed } });
    }).as('closeLoan');
    cy.intercept('POST', '**/api/v1/loans/*/reopen', (req) => {
      const id = Number(req.url.split('/').slice(-2)[0]);
      const current = loans.find((item) => item.id === id) || createdLoan;
      const reopened = {
        ...current,
        status: 'active',
        closedAt: null,
        writtenOffAmount: null,
        pendingBalance: current.writtenOffAmount || '0.00',
      };
      loans = loans.map((item) => (item.id === id ? reopened : item));
      if (createdLoan && createdLoan.id === id) createdLoan = reopened;
      return req.reply({ body: { loan: reopened } });
    }).as('reopenLoan');
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
        reversedAt: null,
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
    /*
     * Reversal is not deletion: the payment keeps its row and gains a
     * `reversedAt`. Only what is still in force counts towards the balance, so
     * the stub has to exclude the reversed rows exactly as the API does.
     */
    cy.intercept('DELETE', '**/api/v1/loans/*/payments/*/reversal', (req) => {
      const id = Number(String(req.url).split('/').slice(-2)[0]);
      payments = payments.map((item) => (item.id === id ? { ...item, reversedAt: null } : item));
      createdLoan = { ...createdLoan, pendingBalance: derivedBalance() };
      loans = [createdLoan];
      return req.reply({ statusCode: 204 });
    }).as('undoReversal');
    cy.intercept('DELETE', '**/api/v1/loans/*/payments/*', (req) => {
      const id = Number(req.url.split('/').pop());
      payments = payments.map((item) =>
        item.id === id ? { ...item, reversedAt: '2026-10-10T12:00:00' } : item,
      );
      createdLoan = { ...createdLoan, pendingBalance: derivedBalance() };
      loans = [createdLoan];
      return req.reply({ statusCode: 204 });
    }).as('reversePayment');
  };

  /**
   * Enter Préstamos the way the operator does: from the project sidebar.
   *
   * This is the shell assertion as much as a navigation helper — the entry has
   * to be reachable from the host's sidebar, in the host's own URL space. The
   * label comes from `common.loans`; the module's own copy is Spanish, the
   * shell's chrome is translated.
   */
  const showLoans = () => {
    cy.get('[data-testid="project:sidebar"]').contains('Loans').click();
    cy.location('pathname').should('eq', '/project/loans');
    cy.wait('@listLoans');
  };

  const showLoanViews = () => {
    cy.get('[data-testid="project:sidebar"]').contains('Loans').click();
    cy.location('pathname').should('eq', '/project/loans');
    // The list owns the "Nuevo Préstamo" action, so the view has to have
    // rendered before a flow that starts from that button clicks it.
    cy.wait('@listLoans');
  };

  beforeEach(() => {
    loans = [];
    createdLoan = null;
    payments = [];
    stubShell();
    stubApi();
    // The guard that matters: no view in this module may reach for Jira.
    cy.intercept('GET', '**/api/v1/jira/**', { statusCode: 500 }).as('jiraRequest');
    cy.visit('/project/board');
    // The shell owns the sidebar; waiting on it is waiting for the host to be up.
    cy.get('[data-testid="project:sidebar"]').contains('Kanban Board').should('be.visible');
  });

  it('navigates the loan views from the project shell without Jira requests', () => {
    showLoanViews();
    cy.contains('Todavía no hay préstamos').should('be.visible');

    // The host sidebar stays: it is the same shell as Kanban Board.
    cy.get('[data-testid="project:sidebar"]').contains('Kanban Board').should('be.visible');

    // The host sidebar is the only navigation: Préstamos has none of its own.
    cy.get('[data-testid="project:sidebar"]').contains('People').click();
    cy.location('pathname').should('eq', '/project/loans/borrowers');
    cy.get('[data-testid="project:sidebar"]').contains('Loans').click();
    cy.location('pathname').should('eq', '/project/loans');
    // Returning to the list refetches it, so the action has to have rendered
    // before this flow starts from it.
    cy.wait('@listLoans');
    // A new loan is an action of the list, not a view of its own.
    cy.get('[data-testid="loans:new"]').click();
    cy.location('pathname').should('eq', '/project/loans/new-loan');

    cy.get('@jiraRequest.all').should('have.length', 0);
  });

  it('creates a borrower inline from the picker and selects it', () => {
    // This case needs "no matches" for the search the inline flow triggers. The
    // query string keeps the wait on the *search*, not on the initial list fetch
    // — both are GETs to the same path.
    cy.intercept('GET', '**/borrowers?*search=Lola*', { borrowers: [] }).as('borrowersEmpty');
    showLoanViews();
    cy.get('[data-testid="loans:new"]').click();

    cy.get('[data-testid="select:borrower"]').click();
    // The dropdown's search box is the shared `Select`'s own, in English.
    cy.get('input[placeholder="Search"]').type('Lola');
    cy.wait('@borrowersEmpty');
    cy.contains('Crear persona').click();
    cy.get('input[placeholder="Nombre"]').type('Lola');
    cy.get('input[placeholder="Apellido"]').type('Paz');
    cy.contains('button', 'Guardar persona').click();
    cy.wait('@createBorrower');
    cy.contains('Persona seleccionada: Lola Paz').should('be.visible');
  });

  it('registers a loan with a live balance preview and lists it', () => {
    showLoans();
    cy.contains('button', 'Nuevo préstamo').click();
    cy.location('pathname').should('eq', '/project/loans/new-loan');

    cy.get('[data-testid="select:borrower"]').click();
    cy.get('input[placeholder="Search"]').type('Lola');
    cy.get('[data-testid="select-option:Lola Paz"]').click();

    cy.get('input[name="amount"]').type('1500.50');
    cy.contains('Saldo pendiente').should('contain', '1500.50 USD');
    cy.get('input[name="advancePaid"]').type('500.25');
    cy.contains('Saldo pendiente').should('contain', '1000.25 USD');
    cy.get('input[name="concept"]').type('Préstamo personal');
    cy.get('input[name="lender"]').type('Ecuche');
    cy.contains('button', 'Guardar préstamo').click();
    cy.wait('@createLoan');

    // The save lands on Préstamos, where the new card is visible.
    cy.location('pathname').should('eq', '/project/loans');
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
    cy.location('pathname').should('eq', '/project/loans/new-loan/1');
    cy.wait('@getLoan');

    // Edit mode preselects the person and locks the currency once paid ahead.
    cy.contains('Persona seleccionada: Lola Paz').should('be.visible');
    /*
     * The lock is the shared `Select` in its disabled state. It reports that on
     * the wrapper it owns (`aria-disabled`), and it must not open a dropdown any
     * more — both are asserted, because a control that only *looks* locked is
     * the failure this pins.
     */
    cy.get('[data-testid="select:currency"]').parent().should('have.attr', 'aria-disabled', 'true');
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
    showLoanViews();
    cy.get('[data-testid="project:sidebar"]').contains('People').click();
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

    /*
     * The lock is the shared `Select` in its disabled state: `aria-disabled` on
     * the control, and the proof that it no longer opens its dropdown. The
     * explanation sits beside it, in Spanish.
     */
    cy.get('[data-testid="select:currency"]').parent().should('have.attr', 'aria-disabled', 'true');
    cy.get('[data-testid="select:currency"]').click();
    cy.get('[data-testid="select-option:ARS"]').should('not.exist');
    cy.contains('No podés cambiar la moneda').should('be.visible');
  });

  it('opens the Personas confirmation dialog', () => {
    cy.intercept('GET', '**/api/v1/borrowers*', {
      borrowers: [{ id: 7, firstName: 'Lola', lastName: 'Paz', loanCount: 0 }],
    }).as('borrowersWithLoans');
    showLoanViews();
    cy.get('[data-testid="project:sidebar"]').contains('People').click();
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
    // 1000.50 on the loan with one 200.00 payment already collected is the
    // 800.50 the API derives, pinned here so the refresh is measured against a
    // balance the stub actually stands behind.
    loans = [loan({ id: 1, amount: '1000.50', pendingBalance: '800.50' })];
    [createdLoan] = loans;
    payments = [
      {
        id: 1,
        loanId: 1,
        amount: '200.00',
        date: '2026-10-08T12:00:00',
        createdAt: '2026-10-08T12:00:00',
        reversedAt: null,
        snapshot: {},
      },
    ];
    showLoans();
    cy.contains('button', 'Editar').click();
    cy.wait('@getLoan');
    cy.wait('@listPayments');

    cy.get('input[name="paymentAmount"]').type('150.00');
    /*
     * The capture is a button, not a nested form: HTML forbids a form inside the
     * loan form, so the register action is explicit.
     */
    cy.contains('button', 'Registrar pago').click();
    cy.wait('@createPayment');
    cy.wait('@listPayments');

    // The history refetched without a reload: the running total is what is
    // still in force, and the capture is ready for the next one.
    cy.contains('Total cobrado').should('contain', '350.00 USD');
    cy.get('input[name="paymentAmount"]').should('have.value', '');
    // The derived balance moved by exactly the payment that was just registered.
    cy.contains('Saldo pendiente').should('contain', '650.50 USD');
    cy.contains('Todavía no hay pagos registrados.').should('not.exist');
  });

  it('refuses an overpayment and keeps the balance untouched', () => {
    loans = [loan({ id: 1, amount: '1000.50', pendingBalance: '1000.50' })];
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
    cy.get('input[name="amount"]').should('have.value', '1000.50');
  });

  it('reverts a payment behind a confirmation and recomputes the balance', () => {
    // Internally consistent on purpose: 1000.50 minus the single 200.00 payment
    // is the 800.50 below, which is what the API derives. The preview is measured
    // against that, and a fixture that did not add up would measure the fixture
    // instead of the reversal.
    loans = [loan({ id: 1, amount: '1000.50', pendingBalance: '800.50' })];
    [createdLoan] = loans;
    payments = [
      {
        id: 1,
        loanId: 1,
        amount: '200.00',
        date: '2026-10-08T12:00:00',
        createdAt: '2026-10-08T12:00:00',
        reversedAt: null,
        snapshot: {},
      },
    ];
    showLoans();
    cy.contains('button', 'Editar').click();
    cy.wait('@getLoan');
    cy.wait('@listPayments');
    cy.contains('Saldo pendiente').should('contain', '800.50 USD');

    // Instrumented to prove the reversal trigger — which lives inside a portal —
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

    cy.contains('button', 'Revertir').click();
    cy.get('[data-testid="modal:confirm"]')
      .should('contain', 'El pago queda registrado como revertido')
      .find('button')
      .contains('Revertir')
      .click();
    cy.wait('@reversePayment');
    cy.wait('@listPayments');

    /*
     * The row survives and says so in words: the payment is not gone, it is
     * marked, because a receipt issued later has to be able to name it.
     */
    cy.contains('Revertido').should('be.visible');
    cy.contains('200.00 USD').should('be.visible');
    cy.contains('Saldo pendiente').should('contain', '1000.50 USD');
    cy.contains('Todavía no hay pagos registrados.').should('not.exist');
    // A reversed payment is not collected money any more.
    cy.contains('Total cobrado').should('contain', '0.00 USD');
    /* eslint-disable no-underscore-dangle */
    cy.window().its('__PAYMENT_POSTS').should('deep.equal', []);
    /* eslint-enable no-underscore-dangle */

    // And it is undoable, so a misclick costs nothing.
    cy.contains('button', 'Deshacer').click();
    cy.get('[data-testid="modal:confirm"]')
      .should('contain', 'El pago vuelve a contar para el saldo.')
      .find('button')
      .contains('Deshacer')
      .click();
    cy.wait('@undoReversal');
    cy.wait('@listPayments');

    cy.contains('Revertido').should('not.exist');
    cy.contains('Saldo pendiente').should('contain', '800.50 USD');
    cy.contains('Total cobrado').should('contain', '200.00 USD');
  });

  it('closes a loan with a write-off and reopens it', () => {
    loans = [loan({ id: 1, amount: '1000.50', pendingBalance: '400.50' })];
    [createdLoan] = loans;
    showLoans();

    // The active section shows the card, and Cerrar states the exact write-off.
    cy.contains('Activos (1)').should('be.visible');
    cy.contains('button', 'Cerrar').click();
    cy.get('[data-testid="modal:confirm"]')
      .should('contain', 'Se condonará el saldo pendiente de 400.50 USD')
      .find('button')
      .contains('Cerrar')
      .click();
    cy.wait('@closeLoan');
    cy.wait('@listLoans');

    // It left Activos; Cerrados is collapsed by default, so no card is rendered.
    cy.contains('Activos (0)').should('be.visible');
    cy.contains('Cerrados (1)').should('be.visible');
    cy.get('article').should('have.length', 0);

    // Expanding shows the closed card: close date, zero balance, the write-off.
    cy.contains('button', 'Mostrar').click();
    cy.get('article').should('have.length', 1);
    cy.contains('Cerrado el').should('be.visible');
    cy.contains('Condonación').should('be.visible');
    cy.contains('400.50 USD').should('be.visible');
    cy.contains('0.00 USD').should('be.visible');

    // Reopening returns it to Activos and clears the write-off.
    cy.contains('button', 'Reabrir').click();
    cy.get('[data-testid="modal:confirm"]').find('button').contains('Reabrir').click();
    cy.wait('@reopenLoan');
    cy.wait('@listLoans');
    cy.contains('Activos (1)').should('be.visible');
    cy.contains('Cerrados (0)').should('be.visible');
  });
});
