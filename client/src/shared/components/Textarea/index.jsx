import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import TextareaAutoSize from 'react-textarea-autosize';

import { StyledTextarea } from './Styles';

/* eslint-disable react/require-default-props */

const propTypes = {
  className: PropTypes.string,
  invalid: PropTypes.bool,
  minRows: PropTypes.number,
  value: PropTypes.string,
  onChange: PropTypes.func,
};



const Textarea = forwardRef(({ 
  className = undefined, 
  invalid = false, 
  onChange = () => {}, 
  ...textareaProps 
}, ref) => (
  <StyledTextarea className={className} $invalid={invalid}>
    <TextareaAutoSize
      {...textareaProps}
      onChange={event => onChange(event.target.value, event)}
      ref={ref}
    />
  </StyledTextarea>
));

Textarea.propTypes = propTypes;

export default Textarea;
