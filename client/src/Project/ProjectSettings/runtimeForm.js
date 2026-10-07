/**
 * Pure logic behind the runtime configuration form.
 *
 * Kept out of the component so it can be tested without a DOM: the rules here are
 * the ones that are easy to get subtly wrong, and getting them wrong is not
 * cosmetic. Submitting an untouched secret as an empty string erases a stored
 * credential, and the user sees a success message.
 */

/**
 * Whether a drafted value should be sent to the API.
 *
 * A secret renders as an empty box because the API never sends it back. An
 * untouched box therefore means "leave it alone", not "set it to empty" — so a
 * blank secret is omitted, while a blank plain value is a real (empty) value.
 *
 * @param {object} entry  Registry metadata for the setting.
 * @param {*} value       What the admin typed.
 * @returns {boolean}
 */
export const shouldSubmit = (entry, value) => {
  if (value === undefined) return false;
  if (entry.isSecret) return value !== '';
  return true;
};

/**
 * Turn a drafted value into the type the API validates against.
 *
 * The API coerces, so sending a string for an integer would still work — but
 * sending the right type keeps the request honest, and a value that cannot be
 * parsed is passed through so the API can explain the rejection rather than this
 * layer inventing a failure.
 *
 * @param {object} entry Registry metadata for the setting.
 * @param {*} value      What the admin typed.
 * @returns {*}
 */
export const coerceValue = (entry, value) => {
  if (entry.type !== 'integer') return value;
  if (value === '' || value === null || value === undefined) return value;

  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
};

/**
 * Build the request body for a batch save.
 *
 * @param {object}  entries Registry entries, keyed by setting key.
 * @param {object}  draft   Typed values, keyed by setting key.
 * @param {string=} group   Restrict the batch to one accordion section.
 * @returns {{changes: Array<{key: string, value: *}>}}
 */
export const buildChangePayload = (entries, draft, group) => ({
  changes: Object.entries(draft)
    .filter(
      ([key, value]) =>
        entries[key] &&
        (group === undefined || entries[key].group === group) &&
        shouldSubmit(entries[key], value),
    )
    .map(([key, value]) => ({ key, value: coerceValue(entries[key], value) })),
});

/**
 * Build the fields for a connectivity probe.
 *
 * Effective values are the starting point and the draft overrides them, so an
 * admin can test one changed field without retyping the rest. Because the
 * effective values are used, a stored password is included without ever having
 * been rendered back to the client.
 *
 * @param {Array<object>} entries       Every registry entry.
 * @param {object}        draft         Typed values, keyed by setting key.
 * @param {string}        overriddenKey The key being tested.
 * @param {*}             overrideValue The value being tested.
 * @returns {object}
 */
export const buildProbeFields = (entries, draft, overriddenKey, overrideValue) => {
  const fields = {};

  entries
    .filter((entry) => entry.group === 'Database')
    .forEach((entry) => {
      const drafted = draft[entry.key];
      const chosen = drafted !== undefined ? drafted : entry.value;
      if (chosen !== undefined && chosen !== null && chosen !== '') {
        fields[entry.key] = chosen;
      }
    });

  if (overrideValue !== undefined && overrideValue !== null && overrideValue !== '') {
    fields[overriddenKey] = overrideValue;
  }

  return fields;
};

/**
 * What the input should show.
 *
 * The field starts from the value **in effect**, not from the draft: rendering
 * only the draft left every configured setting looking empty, so the page
 * appeared not to reflect the environment at all and the operator had to retype
 * a value just to test it.
 *
 * A draft always wins, including an empty one. Clearing a field is a real edit —
 * it is how a value is returned to the fallback — so it must not be refilled from
 * the effective value.
 *
 * @param {object} entry   Registry metadata for the setting.
 * @param {*}      drafted What the admin typed, or undefined if untouched.
 * @returns {string|number}
 */
export const displayValue = (entry, drafted) => {
  if (drafted !== undefined && drafted !== null) return drafted;
  return entry.value === undefined || entry.value === null ? '' : entry.value;
};
