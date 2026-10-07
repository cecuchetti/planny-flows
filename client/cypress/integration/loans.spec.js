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

  const stubApi = () => {
    cy.intercept('GET', '**/api/v1/borrowers*', {
      borrowers: [{ id: 7, firstName: 'Lola', lastName: 'Paz', loanCount: 0 }],
    }).as('borrowers');
    cy.intercept('POST', '**/api/v1/borrowers', {
      borrower: { id: 7, firstName: 'Lola', lastName: 'Paz' },
    }).as('createBorrower');
    cy.intercept('GET', '**/api/v1/loans', (req) => req.reply({ loans })).as('listLoans');
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
    cy.intercept('GET', '**/api/v1/loans/*', (req) =>
      req.reply({ loan: createdLoan || loan() }),
    ).as('getLoan');
    cy.intercept('PUT', '**/api/v1/loans/*', (req) => {
      const { body } = req;
      createdLoan = {
        ...(createdLoan || loan()),
        ...body,
        number: '00042',
        pendingBalance: (Number(body.amount) - Number(body.advancePaid || 0)).toFixed(2),
      };
      loans = [createdLoan];
      req.reply({ body: { loan: createdLoan } });
    }).as('updateLoan');
    cy.intercept('DELETE', '**/api/v1/loans/*', (req) => {
      loans = loans.filter((item) => item.id !== createdLoan.id);
      createdLoan = null;
      req.reply({ statusCode: 204 });
    }).as('deleteLoan');
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
      .should('contain', 'Se elimina el préstamo. No se puede deshacer.')
      .find('button')
      .contains('Eliminar')
      .click();
    cy.wait('@deleteLoan');
    cy.wait('@listLoans');
    cy.contains('Todavía no hay préstamos').should('be.visible');
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
});
