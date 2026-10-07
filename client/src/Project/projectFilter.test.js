import { filterSelection, projectIdsForFilter } from './projectFilter';

const jira = { id: 1, source_type: 'jira' };
const jiraCamel = { id: 2, sourceType: 'jira' };
const local = { id: 3, source_type: 'local' };
const plain = { id: 4 };

describe('projectIdsForFilter', () => {
  const list = [jira, jiraCamel, local, plain];

  it('selects only Jira projects for the jira filter', () => {
    expect(projectIdsForFilter(list, 'jira')).toEqual([1, 2]);
  });

  it('reads either casing of the source field', () => {
    // /projects and /project do not agree on the casing, so both are accepted.
    expect(projectIdsForFilter([jira, jiraCamel], 'jira')).toEqual([1, 2]);
  });

  it('selects everything without a jira source for the local filter', () => {
    expect(projectIdsForFilter(list, 'local')).toEqual([3, 4]);
  });

  it('selects everything for an explicit all', () => {
    expect(projectIdsForFilter(list, 'all')).toEqual([1, 2, 3, 4]);
  });

  it('selects everything for a filter this version does not know', () => {
    // Showing an empty board because of an unrecognised value would look broken.
    expect(projectIdsForFilter(list, 'something-new')).toEqual([1, 2, 3, 4]);
  });

  it('returns an empty selection when nothing matches, not everything', () => {
    // A user with no Jira projects should see an empty board, not all of them.
    expect(projectIdsForFilter([local, plain], 'jira')).toEqual([]);
  });

  it('handles an empty project list', () => {
    expect(projectIdsForFilter([], 'jira')).toEqual([]);
  });
});

describe('filterSelection', () => {
  const list = [jira, jiraCamel, local, plain];

  it('does nothing when the filter has not changed', () => {
    // A re-render, or the ordinary initialisation path.
    expect(filterSelection(null, null, list)).toBeNull();
    expect(filterSelection('jira', 'jira', list)).toBeNull();
  });

  it('applies the filter when the URL gains one', () => {
    // Regression: the board used to apply the URL filter once per mount and
    // ignore every navigation after that.
    expect(filterSelection('jira', null, list)).toEqual([1, 2]);
  });

  it('switches between two filters', () => {
    expect(filterSelection('local', 'jira', list)).toEqual([3, 4]);
  });

  it('shows every project when the filter is dropped', () => {
    // Deliberately not a remembered subset: "the board" must mean the board,
    // otherwise the two sidebar entries can show the same projects.
    expect(filterSelection(null, 'jira', list)).toEqual([1, 2, 3, 4]);
  });

  it('treats an explicit all the same as no filter', () => {
    expect(filterSelection('all', 'jira', list)).toEqual([1, 2, 3, 4]);
  });

  it('returns an empty selection when the filter matches nothing', () => {
    // A real answer, not "no opinion": the board must be empty, not unfiltered.
    expect(filterSelection('jira', null, [local, plain])).toEqual([]);
  });

  it('is not confused by navigating back and forth', () => {
    // The sequence the bug report described.
    const first = filterSelection('jira', null, list);
    const back = filterSelection(null, 'jira', list);
    const again = filterSelection('jira', null, list);

    expect(first).toEqual([1, 2]);
    expect(back).toEqual([1, 2, 3, 4]);
    expect(again).toEqual([1, 2]);
  });
});
