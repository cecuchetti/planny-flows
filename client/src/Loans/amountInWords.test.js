import { amountInWords } from './amountInWords';

describe('amountInWords', () => {
  it('spells zero', () => {
    expect(amountInWords(0)).toBe('cero dólares con 00/100');
  });

  it('uses the singular noun and the apocopated article for one', () => {
    expect(amountInWords(1)).toBe('un dólar con 00/100');
    expect(amountInWords('1', 'ARS')).toBe('un peso con 00/100');
  });

  it('agrees veintiuno to veintiún before the noun', () => {
    expect(amountInWords(21)).toBe('veintiún dólares con 00/100');
  });

  it('spells round hundreds and the cien/ciento split', () => {
    expect(amountInWords(100)).toBe('cien dólares con 00/100');
    expect(amountInWords(101)).toBe('ciento un dólares con 00/100');
  });

  it('spells thousands', () => {
    expect(amountInWords(1000)).toBe('mil dólares con 00/100');
    expect(amountInWords(2000)).toBe('dos mil dólares con 00/100');
  });

  it('spells a compound amount with cents', () => {
    expect(amountInWords('1500.50')).toBe('mil quinientos dólares con 50/100');
  });

  it('spells a round million with the "de" connector', () => {
    expect(amountInWords(1000000)).toBe('un millón de dólares con 00/100');
    expect(amountInWords(2000000)).toBe('dos millones de dólares con 00/100');
  });

  it('spells a million with a remainder without the "de" connector', () => {
    expect(amountInWords(1500000)).toBe('un millón quinientos mil dólares con 00/100');
  });

  it('apocopates uno/veintiuno before millones', () => {
    expect(amountInWords('21000000', 'ARS')).toBe('veintiún millones de pesos con 00/100');
    expect(amountInWords(31000000)).toBe('treinta y un millones de dólares con 00/100');
    expect(amountInWords(101000000)).toBe('ciento un millones de dólares con 00/100');
  });

  it('spells the currency noun for pesos', () => {
    expect(amountInWords('500', 'ARS')).toBe('quinientos pesos con 00/100');
    expect(amountInWords(500)).toBe('quinientos dólares con 00/100');
  });

  it('handles the teens and compound tens', () => {
    expect(amountInWords(16)).toBe('dieciséis dólares con 00/100');
    expect(amountInWords(22)).toBe('veintidós dólares con 00/100');
    expect(amountInWords(31)).toBe('treinta y un dólares con 00/100');
    expect(amountInWords(99)).toBe('noventa y nueve dólares con 00/100');
  });

  it('is empty when there is no amount to spell', () => {
    expect(amountInWords(null)).toBe('');
    expect(amountInWords(undefined)).toBe('');
    expect(amountInWords('')).toBe('');
    expect(amountInWords('abc')).toBe('');
  });

  it('pads single-digit cents to two places', () => {
    expect(amountInWords('10.5')).toBe('diez dólares con 50/100');
    expect(amountInWords('10.05')).toBe('diez dólares con 05/100');
  });
});
