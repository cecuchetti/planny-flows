/**
 * Board project-selection helpers.
 *
 * The board shows a subset of projects. Which subset is driven either by the
 * `?filter=` query parameter (an explicit navigation) or by the user's stored
 * preference, and the two must not be confused: the URL is a view, the stored
 * selection is a preference.
 */

/** Projects may be serialised with either casing, depending on the endpoint. */
const sourceOf = (project) => project.source_type || project.sourceType;

/**
 * Project ids selected by a `?filter=` value.
 *
 * @param {Array<object>} projectList Every project the user can see.
 * @param {string}        filter      `jira`, `local`, or anything else for all.
 * @returns {Array<number>}
 */
export const projectIdsForFilter = (projectList, filter) => {
  if (filter === 'jira') {
    return projectList.filter((project) => sourceOf(project) === 'jira').map((p) => p.id);
  }
  if (filter === 'local') {
    return projectList.filter((project) => sourceOf(project) !== 'jira').map((p) => p.id);
  }
  // 'all', or a value this version does not know: show everything rather than
  // an empty board.
  return projectList.map((project) => project.id);
};

/**
 * The selection a navigation should produce, or `null` when nothing changes.
 *
 * This is the decision the board effect makes on every render, pulled out so the
 * transitions can be tested: the bug it fixes was a *transition* bug, invisible
 * in any single state and only visible when navigating between two.
 *
 * `appliedFilter` is the filter value already reflected in the selection — not a
 * boolean "have we applied one yet". React Router keeps the component mounted
 * when only the query string changes, so a one-shot guard meant the second
 * navigation never took effect and `/project/board` and
 * `/project/board?filter=jira` showed the same board.
 *
 * With no filter the answer is **all projects**, deliberately. A saved selection
 * used to fill that role, which made "Kanban Board" mean "whatever subset you
 * last picked" and let the two sidebar entries show the same board. A nav link
 * labelled with the board is expected to show the board.
 *
 * @param {string|null}   filterParam    The `?filter=` value now in the URL.
 * @param {string|null}   appliedFilter  The value already reflected.
 * @param {Array<object>} projectList    Every project the user can see.
 * @returns {Array<number>|null} The ids to select, or `null` to leave it alone.
 */
export const filterSelection = (filterParam, appliedFilter, projectList) => {
  // Unchanged: a re-render, or the ordinary initialisation path.
  if (filterParam === appliedFilter) return null;

  // Entering or switching views. `null` and 'all' both mean every project.
  return projectIdsForFilter(projectList, filterParam);
};
