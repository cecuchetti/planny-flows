import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';

import { color } from 'shared/utils/styles';
import Icon from 'shared/components/Icon';

import { StyledButton, StyledSpinner, Text } from './Styles';

/* eslint-disable react/require-default-props */

const propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
  variant: PropTypes.oneOf(['primary', 'success', 'danger', 'secondary', 'empty']),
  icon: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  iconSize: PropTypes.number,
  disabled: PropTypes.bool,
  isWorking: PropTypes.bool,
  isActive: PropTypes.bool,
  onClick: PropTypes.func,
};



const Button = forwardRef(
  ({ 
    children = undefined, 
    variant = 'secondary', 
    icon = undefined, 
    iconSize = 18, 
    disabled = false, 
    isWorking = false, 
    isActive = false, 
    onClick = () => {}, 
    ...buttonProps 
  }, ref) => {
    const handleClick = () => {
      if (!disabled && !isWorking) {
        onClick();
      }
    };

    return (
      <StyledButton
        {...buttonProps}
        onClick={handleClick}
        $variant={variant}
        disabled={disabled || isWorking}
        $isWorking={isWorking}
        $iconOnly={!children}
        $isActive={isActive}
        ref={ref}
      >
        {isWorking && <StyledSpinner size={26} color={getIconColor(variant)} />}

        {!isWorking && icon && typeof icon === 'string' ? (
          <Icon type={icon} size={iconSize} color={getIconColor(variant)} />
        ) : (
          icon
        )}
        {children && <Text $withPadding={isWorking || icon}>{children}</Text>}
      </StyledButton>
    );
  },
);

const getIconColor = variant =>
  ['secondary', 'empty'].includes(variant) ? color.textDark : '#fff';

Button.propTypes = propTypes;

export default Button;
