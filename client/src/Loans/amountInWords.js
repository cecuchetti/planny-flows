/*
 * The payment amount in words, in formal Spanish.
 *
 * A receipt has to spell the amount out, which is the one piece of the module
 * that is easy to get subtly wrong, so it lives here as a pure function with no
 * dependencies and an exhaustive test. The shape is:
 *
 *     "<integer in words> <currency noun> con <cc>/100"
 *
 * e.g. "un dólar con 00/100", "veintiún dólares con 50/100",
 * "mil quinientos dólares con 50/100", "un millón de dólares con 00/100".
 *
 * The currency noun agrees in number with the integer part ("un dólar"/"dos
 * dólares"/"quinientos pesos"), and the terminal "uno"/"veintiuno" apocopates to
 * "un"/"veintiún" before the masculine noun. A round million takes "de" before
 * the noun ("un millón de dólares"), as formal Spanish requires.
 */

const UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];

const TEENS = {
  10: 'diez',
  11: 'once',
  12: 'doce',
  13: 'trece',
  14: 'catorce',
  15: 'quince',
  16: 'dieciséis',
  17: 'diecisiete',
  18: 'dieciocho',
  19: 'diecinueve',
};

// 21–29 in the accented single-word forms ("veintidós", not "veintidos").
const TWENTIES = {
  20: 'veinte',
  21: 'veintiuno',
  22: 'veintidós',
  23: 'veintitrés',
  24: 'veinticuatro',
  25: 'veinticinco',
  26: 'veintiséis',
  27: 'veintisiete',
  28: 'veintiocho',
  29: 'veintinueve',
};

const TENS = {
  20: 'veinte',
  30: 'treinta',
  40: 'cuarenta',
  50: 'cincuenta',
  60: 'sesenta',
  70: 'setenta',
  80: 'ochenta',
  90: 'noventa',
};

const HUNDREDS = {
  100: 'cien',
  200: 'doscientos',
  300: 'trescientos',
  400: 'cuatrocientos',
  500: 'quinientos',
  600: 'seiscientos',
  700: 'setecientos',
  800: 'ochocientos',
  900: 'novecientos',
};

const CURRENCY_NOUNS = {
  USD: { singular: 'dólar', plural: 'dólares' },
  ARS: { singular: 'peso', plural: 'pesos' },
};

/** 0–99 in words, in the masculine "uno" form. */
const under100 = (n) => {
  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n];
  if (n < 30) return TWENTIES[n];
  const tens = Math.floor(n / 10) * 10;
  const unit = n % 10;
  return unit === 0 ? TENS[tens] : `${TENS[tens]} y ${UNITS[unit]}`;
};

/** 0–999 in words. */
const under1000 = (n) => {
  if (n < 100) return under100(n);
  const hundreds = Math.floor(n / 100) * 100;
  const rest = n % 100;
  if (rest === 0) return hundreds === 100 ? 'cien' : HUNDREDS[hundreds];
  return `${hundreds === 100 ? 'ciento' : HUNDREDS[hundreds]} ${under100(rest)}`;
};

/**
 * The terminal "uno"/"veintiuno" agrees to "un"/"veintiún" before a masculine
 * noun — the currency nouns here are both masculine.
 */
const agree = (words) => {
  const tokens = words.split(' ');
  const last = tokens[tokens.length - 1];
  if (last === 'uno') tokens[tokens.length - 1] = 'un';
  else if (last === 'veintiuno') tokens[tokens.length - 1] = 'veintiún';
  return tokens.join(' ');
};

/** Any non-negative integer in words, in the masculine "uno" form. */
const intToWords = (n) => {
  if (n === 0) return 'cero';
  if (n < 1000) return under1000(n);
  if (n < 1000000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    const thousandsWords = thousands === 1 ? 'mil' : `${agree(intToWords(thousands))} mil`;
    return rest === 0 ? thousandsWords : `${thousandsWords} ${under1000(rest)}`;
  }
  const millions = Math.floor(n / 1000000);
  const rest = n % 1000000;
  // The millions count agrees in the same way as the thousands count: "veintiún
  // millones", "treinta y un millones". Without `agree` here the terminal
  // "uno"/"veintiuno" would sit before "millones" and never be rewritten, since
  // the top-level `agree` only touches the final token of the whole phrase.
  const millionsWords = millions === 1 ? 'un millón' : `${agree(intToWords(millions))} millones`;
  return rest === 0 ? millionsWords : `${millionsWords} ${intToWords(rest)}`;
};

/**
 * The full amount-in-words phrase for a receipt.
 *
 * @param {string|number|null|undefined} amount The payment amount (any shape the
 *   amount fields hold, normally the two-decimal string the API returns).
 * @param {string} [currency] "USD" or "ARS"; anything else falls back to USD.
 * @returns {string} The formal phrase, or '' when there is no amount to spell.
 */
export const amountInWords = (amount, currency = 'USD') => {
  if (amount === null || amount === undefined || amount === '') return '';
  const parsed = Number(amount);
  if (Number.isNaN(parsed)) return '';

  const noun = CURRENCY_NOUNS[currency] || CURRENCY_NOUNS.USD;
  // Round the cents through the same two-decimal precision the API stores, so a
  // float like 1500.5 never drifts a cent.
  const integerPart = Math.floor(parsed);
  const cents = Math.round((parsed - integerPart) * 100);
  const words = agree(intToWords(integerPart));
  const nounWord = integerPart === 1 ? noun.singular : noun.plural;
  const needsDe = integerPart >= 1000000 && integerPart % 1000000 === 0;
  return `${words}${needsDe ? ' de' : ''} ${nounWord} con ${String(cents).padStart(2, '0')}/100`;
};

export default amountInWords;
