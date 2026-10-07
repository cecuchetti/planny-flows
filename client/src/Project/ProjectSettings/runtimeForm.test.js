import {
  buildChangePayload,
  buildProbeFields,
  coerceValue,
  displayValue,
  shouldSubmit,
} from './runtimeForm';

const entry = (overrides = {}) => ({
  key: 'database.host',
  group: 'Database',
  type: 'string',
  isSecret: false,
  value: null,
  ...overrides,
});

describe('shouldSubmit', () => {
  it('submits a plain value, including an empty one', () => {
    expect(shouldSubmit(entry(), 'db.internal')).toBe(true);
    // Clearing a plain value is a real edit: it falls back to the environment.
    expect(shouldSubmit(entry(), '')).toBe(true);
  });

  it('skips an untouched secret', () => {
    // The box is empty because the API never sends the secret back. Submitting
    // that emptiness would erase the stored credential while reporting success.
    expect(shouldSubmit(entry({ isSecret: true }), '')).toBe(false);
  });

  it('submits a secret once something is typed', () => {
    expect(shouldSubmit(entry({ isSecret: true }), 'hunter2')).toBe(true);
  });

  it('skips a key that was never edited', () => {
    expect(shouldSubmit(entry(), undefined)).toBe(false);
  });
});

describe('coerceValue', () => {
  it('turns an integer field into a number', () => {
    expect(coerceValue(entry({ type: 'integer' }), '6543')).toBe(6543);
  });

  it('leaves non-integer types alone', () => {
    expect(coerceValue(entry(), '5432')).toBe('5432');
  });

  it('passes an unparseable value through for the API to reject', () => {
    // Inventing a failure here would hide the API's explanation of what is wrong.
    expect(coerceValue(entry({ type: 'integer' }), 'not-a-number')).toBe('not-a-number');
  });

  it('does not turn an empty string into zero', () => {
    expect(coerceValue(entry({ type: 'integer' }), '')).toBe('');
  });
});

describe('buildChangePayload', () => {
  const entries = {
    'database.host': entry(),
    'database.port': entry({ key: 'database.port', type: 'integer' }),
    'database.password': entry({ key: 'database.password', isSecret: true }),
  };

  it('omits untouched secrets and keeps everything else', () => {
    const payload = buildChangePayload(entries, {
      'database.host': 'db.internal',
      'database.port': '6543',
      'database.password': '',
    });

    expect(payload.changes).toEqual([
      { key: 'database.host', value: 'db.internal' },
      { key: 'database.port', value: 6543 },
    ]);
    expect(payload.changes.map((c) => c.key)).not.toContain('database.password');
  });

  it('includes a secret once it is typed', () => {
    const payload = buildChangePayload(entries, { 'database.password': 'hunter2' });
    expect(payload.changes).toEqual([{ key: 'database.password', value: 'hunter2' }]);
  });

  it('produces an empty batch when nothing was edited', () => {
    expect(buildChangePayload(entries, {}).changes).toEqual([]);
  });
});

describe('buildProbeFields', () => {
  const entries = [
    entry({ key: 'database.host', value: 'current-host' }),
    entry({ key: 'database.port', type: 'integer', value: 5432 }),
    entry({ key: 'database.password', isSecret: true, value: null }),
    entry({ key: 'sync.jql', group: 'Sync', value: 'assignee=me' }),
  ];

  it('starts from the effective values', () => {
    const fields = buildProbeFields(entries, {}, 'database.host', 'new-host');
    expect(fields).toEqual({ 'database.host': 'new-host', 'database.port': 5432 });
  });

  it('lets the draft override the effective value', () => {
    const fields = buildProbeFields(entries, { 'database.port': 6543 }, 'database.host', 'h');
    expect(fields['database.port']).toBe(6543);
  });

  it('never probes a non-database key', () => {
    // The API only accepts the connection, so anything else would be rejected.
    const fields = buildProbeFields(entries, {}, 'database.host', 'h');
    expect(fields).not.toHaveProperty('sync.jql');
  });

  it('omits a secret that has no value anywhere', () => {
    const fields = buildProbeFields(entries, {}, 'database.host', 'h');
    expect(fields).not.toHaveProperty('database.password');
  });

  it('includes the value being tested even if nothing was drafted', () => {
    const fields = buildProbeFields(entries, {}, 'database.host', 'typed-just-now');
    expect(fields['database.host']).toBe('typed-just-now');
  });
});

describe('displayValue', () => {
  it('shows the value in effect when nothing was typed', () => {
    // Rendering only the draft made every configured setting look empty, so the
    // page appeared not to reflect the environment at all.
    expect(displayValue(entry({ value: 'db.internal' }), undefined)).toBe('db.internal');
  });

  it('shows a typed value over the effective one', () => {
    expect(displayValue(entry({ value: 'old' }), 'new')).toBe('new');
  });

  it('keeps a cleared field empty', () => {
    // Clearing is how a value returns to the fallback; refilling it here would
    // make the edit impossible to perform.
    expect(displayValue(entry({ value: 'db.internal' }), '')).toBe('');
  });

  it('shows nothing for a secret, which has no value to show', () => {
    expect(displayValue(entry({ isSecret: true, value: null }), undefined)).toBe('');
  });

  it('shows nothing when the effective value is empty', () => {
    expect(displayValue(entry({ value: null }), undefined)).toBe('');
  });

  it('passes numbers through untouched', () => {
    expect(displayValue(entry({ type: 'integer', value: 100 }), undefined)).toBe(100);
  });
});
