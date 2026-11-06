/* eslint-disable react/no-danger */
import React, { useLayoutEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';

import { Content } from './Styles';

// Exported so tests can assert the whitelist directly (see TextEditedContent.test.jsx).
export const DOMPURIFY_CONFIG = {
  // h4-h6 keep the full Jira heading hierarchy: the sync maps heading attrs.level 4-6 to them.
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
};

/*
 * Legacy rows can hold plain text (newlines as \n, no markup), which renders as a
 * single squashed paragraph unless the newlines become <br /> before sanitizing.
 * Content carrying any HTML tag is markup and goes through the sanitizer as-is.
 */
const HTML_TAG_PATTERN = /<[a-z][\s\S]*>/i;
const ESCAPED_CHARACTERS = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

const escapeHtmlEntities = (line) =>
  line.replace(/[&<>]/g, (character) => ESCAPED_CHARACTERS[character]);

export const toSanitizedContent = (content, sanitize) => {
  const trimmed = content.trim();
  // Whitespace-only content renders empty exactly as before: no <br /> conversion.
  if (!trimmed || HTML_TAG_PATTERN.test(trimmed)) {
    return sanitize(content);
  }
  return sanitize(content.split('\n').map(escapeHtmlEntities).join('<br />'));
};

const propTypes = {
  content: PropTypes.string.isRequired,
};

const TextEditedContent = ({ content, ...otherProps }) => {
  const [cssLoaded, setCssLoaded] = useState(false);
  const [purifyReady, setPurifyReady] = useState(false);
  const purifyRef = useRef(null);

  useLayoutEffect(() => {
    import('quill/dist/quill.snow.css')
      .then(() => setCssLoaded(true))
      .catch(() => {});

    import('dompurify')
      .then((mod) => {
        purifyRef.current = mod.default || mod;
        setPurifyReady(true);
      })
      .catch(() => {});
  }, []);

  const safeContent = purifyReady
    ? toSanitizedContent(content, (dirty) => purifyRef.current.sanitize(dirty, DOMPURIFY_CONFIG))
    : '';

  return (
    <div className={`ql-snow ${cssLoaded ? '' : 'ql-loading'}`}>
      <Content className="ql-editor" dangerouslySetInnerHTML={{ __html: safeContent }} {...otherProps} />
    </div>
  );
};

TextEditedContent.propTypes = propTypes;

export default TextEditedContent;
