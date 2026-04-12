/* eslint-disable react/no-danger */
import React, { useLayoutEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';

import { Content } from './Styles';

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'blockquote', 'code', 'pre', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
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

  const safeContent = purifyReady ? purifyRef.current.sanitize(content, DOMPURIFY_CONFIG) : '';

  return (
    <div className={`ql-snow ${cssLoaded ? '' : 'ql-loading'}`}>
      <Content className="ql-editor" dangerouslySetInnerHTML={{ __html: safeContent }} {...otherProps} />
    </div>
  );
};

TextEditedContent.propTypes = propTypes;

export default TextEditedContent;
