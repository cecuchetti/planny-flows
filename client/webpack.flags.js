/*
 * Build-time feature flags.
 *
 * This is the one place that decides whether an optional feature is part of a
 * build. Both webpack configs require it; the client reads the decision through
 * the `process.env` constants they define. CommonJS on purpose: webpack loads
 * these configs with `require`, not through Babel.
 *
 * The Loans app is optional because its API module is. Gating the lazy import
 * on a constant is not enough — webpack registers the `import()` in the module
 * graph before folding the constant, so the feature still ships. Elimination
 * comes from `resolve.alias`, which maps the specifier to the empty module.
 *
 * Default is enabled: an unset variable must never remove a feature silently.
 */
const loansEnabled = process.env.REACT_APP_ENABLED_LOANS !== 'false';

module.exports = { loansEnabled };
