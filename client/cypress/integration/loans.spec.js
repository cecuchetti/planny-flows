describe('Loans foundation', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/v1/borrowers*', { borrowers: [] }).as('borrowers');
    cy.intercept('POST', '**/api/v1/borrowers', {
      borrower: { id: 7, firstName: 'Lola', lastName: 'Paz' },
    }).as('createBorrower');
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
    cy.contains('Nuevo Préstamo').click();
    cy.get('input[placeholder="Buscá una persona"]').type('Lola');
    cy.contains('Crear persona').click();
    cy.get('input[placeholder="Nombre"]').type('Lola');
    cy.get('input[placeholder="Apellido"]').type('Paz');
    cy.contains('Guardar persona').click();
    cy.wait('@createBorrower');
    cy.contains('Persona seleccionada: Lola Paz').should('be.visible');
  });
});
