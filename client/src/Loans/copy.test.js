import { loanNavigation } from './copy';

describe('loan navigation', () => {
  it('defines the five foundation views in their product order', () => {
    expect(loanNavigation.map(({ key }) => key)).toEqual([
      'dashboard',
      'loans',
      'borrowers',
      'new-loan',
      'receipt',
    ]);
  });
});
