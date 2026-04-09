import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import moment from 'moment';

import { Modal, Button, Input, DatePicker } from 'shared/components';
import toast from 'shared/utils/toast';

import {
  ModalContents,
  ModalHeader,
  HeaderRow,
  KeyBadge,
  ModalTitle,
  SummaryText,
  FormBody,
  Field,
  Label,
  Hint,
  Actions,
  ActionsRight,
  WarningBanner,
  DatePickerWrapper,
  InputWrapper,
  DescriptionWrapper,
} from './styles';

import { parseHoursToSeconds, parseDurationToMinutes } from './utils';

const propTypes = {
  /** Control visibility */
  isOpen: PropTypes.bool.isRequired,
  /** Close callback */
  onClose: PropTypes.func.isRequired,
  /** Submit callback - receives form data object */
  onSubmit: PropTypes.func.isRequired,
  /** Modal title */
  title: PropTypes.string.isRequired,
  /** Entity key to display in badge (e.g., issue key, task key) */
  entityKey: PropTypes.string,
  /** Entity summary/description */
  entitySummary: PropTypes.string,
  /** Whether to show the description field */
  showDescription: PropTypes.bool,
  /** Whether DatePicker includes time selection */
  withTime: PropTypes.bool,
  /** Time parser mode: 'seconds' for JIRA worklogs, 'minutes' for Tempo */
  timeMode: PropTypes.oneOf(['seconds', 'minutes']),
  /** Initial values for form fields */
  initialValues: PropTypes.shape({
    date: PropTypes.string,
    hours: PropTypes.string,
    description: PropTypes.string,
  }),
  /** Text for submit button */
  submitButtonText: PropTypes.string,
  /** Cancel button text */
  cancelButtonText: PropTypes.string,
  /** Warning message to display */
  warning: PropTypes.node,
  /** Whether to show close entity button */
  canCloseEntity: PropTypes.bool,
  /** Close entity button text */
  closeEntityText: PropTypes.string,
  /** Callback for closing entity */
  onCloseEntity: PropTypes.func,
  /** Callback when date changes - receives the new date value */
  onDateChange: PropTypes.func,
  /** Loading state for submit */
  isSubmitting: PropTypes.bool,
  /** Loading state for close entity */
  isClosingEntity: PropTypes.bool,
  /** Custom validation function for hours */
  validateHours: PropTypes.func,
  /** Custom error messages */
  errorMessages: PropTypes.shape({
    hoursRequired: PropTypes.string,
    hoursInvalid: PropTypes.string,
    hoursPositive: PropTypes.string,
    descriptionTooLong: PropTypes.string,
  }),
  /** Field labels */
  labels: PropTypes.shape({
    hours: PropTypes.string,
    date: PropTypes.string,
    description: PropTypes.string,
    hoursHint: PropTypes.string,
  }),
  /** Placeholders */
  placeholders: PropTypes.shape({
    hours: PropTypes.string,
    description: PropTypes.string,
  }),
  /** Test ID for testing */
  testid: PropTypes.string,
  /** Custom modal width */
  width: PropTypes.number,
  /** Gradient colors for header */
  headerGradient: PropTypes.shape({
    start: PropTypes.string,
    end: PropTypes.string,
  }),
  /** Badge colors */
  badgeColors: PropTypes.shape({
    bg: PropTypes.string,
    border: PropTypes.string,
    text: PropTypes.string,
  }),
};

const defaultProps = {
  entityKey: null,
  entitySummary: null,
  showDescription: true,
  withTime: true,
  timeMode: 'seconds',
  initialValues: {},
  submitButtonText: null, // Uses t('common.save')
  cancelButtonText: null, // Uses t('common.cancel')
  warning: null,
  canCloseEntity: false,
  closeEntityText: null,
  onCloseEntity: null,
  onDateChange: null,
  isSubmitting: false,
  isClosingEntity: false,
  validateHours: null,
  errorMessages: {},
  labels: {},
  placeholders: {},
  testid: 'modal:time-entry',
  width: 460,
  headerGradient: {},
  badgeColors: {},
};

export default function TimeEntry({
  isOpen,
  onClose,
  onSubmit,
  title,
  entityKey,
  entitySummary,
  showDescription,
  withTime,
  timeMode,
  initialValues,
  submitButtonText,
  cancelButtonText,
  warning,
  canCloseEntity,
  closeEntityText,
  onCloseEntity,
  onDateChange,
  isSubmitting,
  isClosingEntity,
  validateHours: customValidateHours,
  errorMessages,
  labels,
  placeholders,
  testid,
  width,
  headerGradient,
  badgeColors,
}) {
  const { t } = useTranslation();

  // Default initial values
  // Always default to 16:30 (4:30 PM) even when withTime=false
  const defaultDate = moment()
    .set({ hour: 16, minute: 30, second: 0, millisecond: 0 })
    .format('YYYY-MM-DDTHH:mm');

  // Form state
  const [hoursInput, setHoursInput] = useState(initialValues.hours || '');
  const [dateValue, setDateValue] = useState(initialValues.date || defaultDate);
  const [description, setDescription] = useState(initialValues.description || '');
  const [hoursError, setHoursError] = useState('');
  const [timeError, setTimeError] = useState('');

  // Extract date and time for separate inputs
  const datePart = withTime && dateValue && dateValue.includes('T') 
    ? dateValue.split('T')[0] 
    : dateValue;
  
  const timePart = withTime && dateValue && dateValue.includes('T')
    ? formatTimeForDisplay(dateValue.split('T')[1])
    : '4:30 PM';
  
  const [timeInput, setTimeInput] = useState(timePart);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setHoursInput(initialValues.hours || '');
      setDateValue(initialValues.date || defaultDate);
      setDescription(initialValues.description || '');
      setHoursError('');
      setTimeError('');
      // Reset time input based on initial date
      const initialTime = withTime && initialValues.date && initialValues.date.includes('T')
        ? formatTimeForDisplay(initialValues.date.split('T')[1])
        : '4:30 PM';
      setTimeInput(initialTime);
    }
  }, [isOpen, initialValues.hours, initialValues.date, initialValues.description, defaultDate, withTime]);

  const parseHours = useCallback(
    (input) => (timeMode === 'seconds'
      ? parseHoursToSeconds(input)
      : parseDurationToMinutes(input)),
    [timeMode]
  );

  const validateHoursInternal = useCallback(
    (value) => {
      if (customValidateHours) {
        return customValidateHours(value, t, setHoursError);
      }

      const parsed = parseHours(value);

      if (value.trim() === '') {
        setHoursError(errorMessages.hoursRequired || t('timeEntry.hoursRequired'));
        return null;
      }
      if (parsed === null) {
        setHoursError(errorMessages.hoursInvalid || t('timeEntry.hoursInvalid'));
        return null;
      }
      if (parsed <= 0) {
        setHoursError(errorMessages.hoursPositive || t('timeEntry.hoursPositive'));
        return null;
      }
      setHoursError('');
      return parsed;
    },
    [customValidateHours, parseHours, errorMessages, t]
  );

  const handleHoursBlur = useCallback(() => {
    if (hoursInput.trim()) {
      validateHoursInternal(hoursInput);
    }
  }, [hoursInput, validateHoursInternal]);

  const handleDateChange = useCallback(
    (value) => {
      // Combine date with current time input
      let newDateValue;
      if (withTime && value && !value.includes('T')) {
        // If value is just a date (YYYY-MM-DD), combine with time
        const parsedTime = parseTimeInput(timeInput) || { hours: '16', minutes: '30' };
        newDateValue = `${value}T${parsedTime.hours}:${parsedTime.minutes}`;
      } else {
        newDateValue = value;
      }
      setDateValue(newDateValue);
      // Notify parent about date change
      if (onDateChange) {
        onDateChange(newDateValue);
      }
    },
    [onDateChange, withTime, timeInput]
  );

  const handleTimeChange = useCallback((value) => {
    setTimeInput(value);
    const error = validateTimeInput(value);
    setTimeError(error || '');
    
    // Update dateValue with new time if valid
    if (!error && datePart) {
      const parsedTime = parseTimeInput(value);
      if (parsedTime) {
        const newDateValue = `${datePart}T${parsedTime.hours}:${parsedTime.minutes}`;
        setDateValue(newDateValue);
      }
    }
  }, [datePart]);

  const handleSubmit = useCallback(
    async (e) => {
      if (e) e.preventDefault();

      const parsedTime = validateHoursInternal(hoursInput);
      if (parsedTime == null) return;

      const desc = description.trim();
      if (desc.length > 5000) {
        toast.error(errorMessages.descriptionTooLong || t('timeEntry.descriptionTooLong'));
        return;
      }

      const formData = {
        hoursInput,
        parsedTime,
        date: dateValue,
        description: desc,
        timeMode,
      };

      await onSubmit(formData);
    },
    [
      hoursInput,
      dateValue,
      description,
      timeMode,
      validateHoursInternal,
      onSubmit,
      errorMessages.descriptionTooLong,
      t,
    ]
  );

  const handleCloseEntity = useCallback(async () => {
    if (onCloseEntity) {
      await onCloseEntity();
    }
  }, [onCloseEntity]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <Modal
      testid={testid}
      isOpen={isOpen}
      onClose={onClose}
      width={width}
      withCloseIcon
      renderContent={() => (
        <ModalContents>
          <ModalHeader
            $gradientStart={headerGradient.start}
            $gradientEnd={headerGradient.end}
          >
            <HeaderRow>
              {entityKey && (
                <KeyBadge
                  $bg={badgeColors.bg}
                  $border={badgeColors.border}
                  $text={badgeColors.text}
                >
                  {entityKey}
                </KeyBadge>
              )}
              <ModalTitle>{title}</ModalTitle>
            </HeaderRow>
            {entitySummary && <SummaryText>{entitySummary}</SummaryText>}
          </ModalHeader>

          <form onSubmit={handleSubmit}>
            <FormBody>
              {warning && (
                <WarningBanner>
                  <span className="warning-icon">⚠️</span>
                  {warning}
                </WarningBanner>
              )}

              <Field>
                <Label>
                  {labels.hours || t('timeEntry.hoursLogged')} *
                </Label>
                <InputWrapper>
                  <Input
                    value={hoursInput}
                    onChange={setHoursInput}
                    onBlur={handleHoursBlur}
                    placeholder={placeholders.hours || 'ej. 2h, 1h 30m, 2.5'}
                    invalid={!!hoursError}
                    aria-invalid={!!hoursError}
                    aria-describedby={hoursError ? 'time-entry-hours-error' : undefined}
                  />
                  <Hint>{labels.hoursHint || t('timeEntry.hoursHint')}</Hint>
                  {hoursError && (
                    <Hint id="time-entry-hours-error" $error>
                      {hoursError}
                    </Hint>
                  )}
                </InputWrapper>
              </Field>

              <Field>
                <Label>{labels.date || (withTime ? t('timeEntry.dateAndTime') : t('timeEntry.date'))} *</Label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <DatePickerWrapper style={{ flex: 1 }}>
                    <DatePicker
                      withTime={false}
                      value={datePart}
                      onChange={handleDateChange}
                    />
                  </DatePickerWrapper>
                  {withTime && (
                    <InputWrapper style={{ flex: '0 0 120px' }}>
                      <Input
                        value={timeInput}
                        onChange={handleTimeChange}
                        onBlur={() => {
                          const error = validateTimeInput(timeInput);
                          setTimeError(error || '');
                        }}
                        placeholder="4:30 PM"
                        invalid={!!timeError}
                        aria-invalid={!!timeError}
                        aria-describedby={timeError ? 'time-entry-time-error' : undefined}
                      />
                      {timeError && (
                        <Hint id="time-entry-time-error" $error>
                          {timeError}
                        </Hint>
                      )}
                    </InputWrapper>
                  )}
                </div>
              </Field>

              {showDescription && (
                <Field>
                  <Label>{labels.description || t('timeEntry.description')}</Label>
                  <DescriptionWrapper>
                    <Input
                      value={description}
                      onChange={setDescription}
                      placeholder={placeholders.description || t('timeEntry.descriptionPlaceholder')}
                    />
                  </DescriptionWrapper>
                </Field>
              )}

              <Actions>
                {canCloseEntity && onCloseEntity && (
                  <Button
                    type="button"
                    variant="danger"
                    isWorking={isClosingEntity}
                    onClick={handleCloseEntity}
                  >
                    {closeEntityText || t('timeEntry.closeIssue')}
                  </Button>
                )}
                <ActionsRight>
                  <Button type="button" variant="empty" onClick={handleCancel}>
                    {cancelButtonText || t('common.cancel')}
                  </Button>
                  <Button type="submit" variant="primary" isWorking={isSubmitting}>
                    {submitButtonText || t('common.save')}
                  </Button>
                </ActionsRight>
              </Actions>
            </FormBody>
          </form>
        </ModalContents>
      )}
    />
  );
}

// Helper functions for time formatting and parsing
function formatTimeForDisplay(timeStr) {
  if (!timeStr) return '4:30 PM';
  const [hoursStr, minutesStr] = timeStr.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return '4:30 PM';
  
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = String(minutes).padStart(2, '0');
  
  return `${displayHours}:${displayMinutes} ${period}`;
}

function parseTimeInput(input) {
  if (!input || typeof input !== 'string') return null;
  
  const trimmed = input.trim().toLowerCase();
  
  // Try "4:30 PM" or "16:30" format
  const match = trimmed.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3];
  
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;
  
  // Handle AM/PM
  if (period === 'pm' && hours < 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;
  
  // Validate hours (0-23)
  if (hours < 0 || hours > 23) return null;
  
  return {
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0')
  };
}

function validateTimeInput(input) {
  if (!input || !input.trim()) return 'Time is required';
  const parsed = parseTimeInput(input);
  if (!parsed) return 'Invalid time format. Use "4:30 PM" or "16:30"';
  return null;
}

TimeEntry.propTypes = propTypes;
TimeEntry.defaultProps = defaultProps;
