import React, { Suspense, lazy } from 'react';
import PropTypes from 'prop-types';
import uniqueId from 'lodash/uniqueId';

import Input from 'shared/components/Input';
import Select from 'shared/components/Select';
import Textarea from 'shared/components/Textarea';

import { StyledField, FieldLabel, FieldTip, FieldError } from './Styles';

/* eslint-disable react/require-default-props */

const propTypes = {
  className: PropTypes.string,
  label: PropTypes.string,
  tip: PropTypes.string,
  error: PropTypes.string,
  name: PropTypes.string,
};

const TextEditor = lazy(() => import('shared/components/TextEditor'));
const DatePicker = lazy(() => import('shared/components/DatePicker'));

const generateField = (FormComponent) => {
  const FieldComponent = ({
    className = undefined,
    label = undefined,
    tip = undefined,
    error = undefined,
    name = undefined,
    ...otherProps
  }) => {
    const fieldId = uniqueId('form-field-');

    return (
      <StyledField
        className={className}
        $hasLabel={!!label}
        data-testid={name ? `form-field:${name}` : 'form-field'}
      >
        {label && <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>}
        <FormComponent id={fieldId} invalid={!!error} name={name} {...otherProps} />
        {tip && <FieldTip>{tip}</FieldTip>}
        {error && <FieldError>{error}</FieldError>}
      </StyledField>
    );
  };

  FieldComponent.propTypes = propTypes;

  return FieldComponent;
};

const generateLazyField = (LazyFormComponent) => {
  const FieldComponent = ({
    className = undefined,
    label = undefined,
    tip = undefined,
    error = undefined,
    name = undefined,
    ...otherProps
  }) => {
    const fieldId = uniqueId('form-field-');

    return (
      <StyledField
        className={className}
        $hasLabel={!!label}
        data-testid={name ? `form-field:${name}` : 'form-field'}
      >
        {label && <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>}
        <Suspense fallback={null}>
          <LazyFormComponent id={fieldId} invalid={!!error} name={name} {...otherProps} />
        </Suspense>
        {tip && <FieldTip>{tip}</FieldTip>}
        {error && <FieldError>{error}</FieldError>}
      </StyledField>
    );
  };

  FieldComponent.propTypes = propTypes;

  return FieldComponent;
};

export default {
  Input: generateField(Input),
  Select: generateField(Select),
  Textarea: generateField(Textarea),
  TextEditor: generateLazyField(TextEditor),
  DatePicker: generateLazyField(DatePicker),
};
