import { toSanitizedContent, DOMPURIFY_CONFIG } from './index';

/*
 * Rendering this component needs a DOM (jest-environment-jsdom is not a project
 * dependency), so the tests target the pure conversion pipeline instead. The
 * sanitizer is injected as a callback: this stand-in mirrors the one behaviour
 * the assertions below rely on — markup is stripped of script blocks. The real
 * DOMPurify config is untouched by the change under test.
 */
const fakeSanitize = (dirty) => dirty.replace(/<script[\s\S]*?<\/script>/gi, '');

describe('toSanitizedContent', () => {
  it('converts plain text newlines to <br /> so line breaks survive', () => {
    const output = toSanitizedContent('first line\nsecond line\nthird', fakeSanitize);
    expect(output).toBe('first line<br />second line<br />third');
  });

  it('renders single-line plain text without <br />', () => {
    const output = toSanitizedContent('just one line', fakeSanitize);
    expect(output).toBe('just one line');
  });

  it('keeps HTML content intact on the markup path', () => {
    const html = '<p>hello <strong>world</strong></p>';
    expect(toSanitizedContent(html, fakeSanitize)).toBe('<p>hello <strong>world</strong></p>');
  });

  it('strips script tags from HTML content through the sanitizer', () => {
    const html = '<p>safe</p><script>alert(1)</script>';
    expect(toSanitizedContent(html, fakeSanitize)).toBe('<p>safe</p>');
  });

  it('escapes entity-bearing plain text before sanitizing, so it shows as text', () => {
    // No "<letter" tag anywhere in the trimmed content, so it takes the plain path.
    const output = toSanitizedContent('1 < 2 & 3 > 2', fakeSanitize);
    expect(output).toBe('1 &lt; 2 &amp; 3 &gt; 2');
  });

  it('renders empty content as empty', () => {
    expect(toSanitizedContent('', fakeSanitize)).toBe('');
  });

  it('leaves whitespace-only content untouched, like the old behavior', () => {
    expect(toSanitizedContent('  \n  ', fakeSanitize)).toBe('  \n  ');
  });

  it('is deterministic for repeated calls with the same input', () => {
    const content = 'alpha\nbeta & gamma\n<em>delta</em>';
    expect(toSanitizedContent(content, fakeSanitize)).toBe(
      toSanitizedContent(content, fakeSanitize),
    );
  });

  it('whitelists h4, h5 and h6 headings in the real DOMPurify config', () => {
    // The Jira sync produces heading attrs.level 4-6; the sanitizer must keep them.
    ['h4', 'h5', 'h6'].forEach((tag) => {
      expect(DOMPURIFY_CONFIG.ALLOWED_TAGS).toContain(tag);
    });
  });

  it('keeps h4-h6 markup intact through the sanitize path', () => {
    const html = '<h4>Section</h4><h5>Subsection</h5><h6>Detail</h6>';
    expect(toSanitizedContent(html, fakeSanitize)).toBe(html);
  });
});
