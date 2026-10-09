/*
 * The client half of the Loans build flag.
 *
 * `webpack.flags.js` decides on the Node side; both webpack configs inline its
 * answer into `process.env.REACT_APP_ENABLED_LOANS` through `DefinePlugin`. This
 * module is the single place the browser side reads it, so the convention lives
 * once per runtime instead of once per component that needs it.
 *
 * The comparison is against the string `'false'` rather than a boolean because
 * that is what survives the boundary intact: `DefinePlugin` substitutes a string
 * literal, and the same expression is evaluated identically outside webpack (in
 * Jest, where the variable is whatever the environment holds). Anything other
 * than an explicit `'false'` counts as enabled, so a missing or renamed value
 * fails safe — an unset flag must never remove a feature silently.
 */
export const LOANS_ENABLED = process.env.REACT_APP_ENABLED_LOANS !== 'false';
