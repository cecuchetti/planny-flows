/*
 * The flag's default is the regression that matters: if "unset" ever stopped
 * meaning "enabled", every build would silently drop the Loans feature — and
 * nothing else in the app would fail to compile. So it is pinned by a test.
 *
 * The flag also crosses a `DefinePlugin` boundary whose two sides decide
 * independently: `webpack.flags.js` reads the environment on the Node side when
 * a config loads, while `shared/utils/loansFlag.js` is evaluated inside the
 * bundle from the value webpack inlined. Testing one alone would let them drift
 * — a convention change on either side would ship the feature disabled with
 * every test still green. So each case asserts both sides, and the last cases
 * assert the configs actually inline that answer.
 */
const FLAG = 'REACT_APP_ENABLED_LOANS';

const setFlag = (value) => {
  if (value === undefined) delete process.env[FLAG];
  else process.env[FLAG] = value;
};

/* Both sides of the boundary, each reloaded so it re-reads the environment. */
const loadBothSides = () => {
  jest.resetModules();
  // eslint-disable-next-line global-require -- the point is to reload it per case
  const node = require('../webpack.flags').loansEnabled;
  // eslint-disable-next-line global-require -- same
  const client = require('shared/utils/loansFlag').LOANS_ENABLED;
  return { node, client };
};

/* The literal each config hands to `DefinePlugin` for the flag. */
const inlined = () => {
  jest.resetModules();
  /* eslint-disable global-require -- these must be reloaded with the env too */
  const prod = require('../webpack.config.production');
  const dev = require('../webpack.config');
  /* eslint-enable global-require */
  const prodDefines = prod.plugins.find(
    (plugin) => plugin.definitions && 'process.env' in plugin.definitions,
  ).definitions['process.env'];
  const devDefines = dev.plugins.find(
    (plugin) => plugin.definitions && `process.env.${FLAG}` in plugin.definitions,
  ).definitions;
  return { prod: prodDefines[FLAG], dev: devDefines[`process.env.${FLAG}`] };
};

describe('Loans build flag', () => {
  const original = process.env[FLAG];

  afterEach(() => {
    setFlag(original);
  });

  it('is enabled on both sides when the variable is unset', () => {
    setFlag(undefined);
    expect(loadBothSides()).toEqual({ node: true, client: true });
  });

  it("is enabled on both sides when the variable is 'true'", () => {
    setFlag('true');
    expect(loadBothSides()).toEqual({ node: true, client: true });
  });

  it("is disabled on both sides only when the variable is exactly 'false'", () => {
    setFlag('false');
    expect(loadBothSides()).toEqual({ node: false, client: false });
  });

  it('treats anything else as enabled, so a typo cannot remove the feature', () => {
    setFlag('0');
    expect(loadBothSides()).toEqual({ node: true, client: true });
  });

  it('inlines the resolved answer in both webpack configs', () => {
    for (const value of ['true', 'false']) {
      setFlag(value);
      expect(inlined()).toEqual({ prod: JSON.stringify(value), dev: JSON.stringify(value) });
    }
  });

  it('inlines enabled when the variable is unset', () => {
    setFlag(undefined);
    expect(inlined()).toEqual({ prod: '"true"', dev: '"true"' });
  });
});
