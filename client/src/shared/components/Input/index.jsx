import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';

import { StyledInput, InputElement, StyledIcon } from './Styles';

/* eslint-disable react/require-default-props */

const propTypes = {
  className: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  icon: PropTypes.string,
  invalid: PropTypes.bool,
  filter: PropTypes.instanceOf(RegExp),
  onChange: PropTypes.func,
};



const Input = forwardRef(({ 
  icon = undefined, 
  className = undefined, 
  filter = undefined, 
  onChange = () => {}, 
  invalid = false, 
  ...inputProps 
}, ref) => {
  const handleChange = event => {
    if (!filter || filter.test(event.target.value)) {
      onChange(event.target.value, event);
    }
  };

  return (
    <StyledInput className={className}>
      {icon && <StyledIcon type={icon} size={15} />}
      <InputElement {...inputProps} $hasIcon={!!icon} $invalid={invalid} onChange={handleChange} ref={ref} />
    </StyledInput>
  );
});

Input.propTypes = propTypes;

export default Input;
