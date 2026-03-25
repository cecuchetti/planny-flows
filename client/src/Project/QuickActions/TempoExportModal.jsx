import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import moment from 'moment';

import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { Modal, Button, DatePicker, Input } from 'shared/components';

import {
  ModalContents,
  ModalHeader,
  HeaderRow,
  TaskKeyBadge,
  ModalTitle,
  TaskSummary,
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
} from './TempoExportModalStyles';

const TEMPO_EXPORT_URL = '/quick-actions/actions/tempo-export';
const TASK_KEY = 'VIS-2';

/**
 * Parse duration input: "2h", "2 h", "2.5h", "1h 30m", "30m" -> minutes or null if invalid.
 * Rejects ambiguous inputs with duplicate units (e.g., "2h 2h" or "30m 45m").
 */
export function parseDurationToMinutes(input) {
  if (input == null || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/,/g, '.').toLowerCase();

  // Check for duplicate unit patterns (ambiguous input)
  const hourMatches = normalized.match(/\d+(?:\.\d+)?\s*h/g);
  const minuteMatches = normalized.match(/\d+(?:\.\d+)?\s*m/g);

  if ((hourMatches && hourMatches.length > 1) || (minuteMatches && minuteMatches.length > 1)) {
    return null;
  }

  let totalMinutes = 0;

  const hMatch = normalized.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hMatch) {
    totalMinutes += parseFloat(hMatch[1]) * 60;
  }

  const mMatch = normalized.match(/(\d+(?:\.\d+)?)\s*m/);
  if (mMatch) {
    totalMinutes += parseFloat(mMatch[1]);
  }

  if (totalMinutes > 0) return totalMinutes;

  const onlyNumber = normalized.match(/^(\d+(?:\.\d+)?)\s*$/);
  if (onlyNumber) {
    const val = parseFloat(onlyNumber[1]);
    if (Number.isFinite(val) && val > 0) return Math.round(val * 60);
  }

  return null;
}

export default function TempoExportModal({ isOpen = false, onClose, onSubmitted }) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(() => moment().startOf('day').format('YYYY-MM-DD'));
  const [hoursInput, setHoursInput] = useState('');
  const [hoursError, setHoursError] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hoursStatus, setHoursStatus] = useState(null);
  const [hoursFetchError, setHoursFetchError] = useState(false);

  // Fetch hours for a specific date
  const fetchHoursForDate = useCallback(async (date) => {
    if (!date) return;
    try {
      const data = await api.get(`/quick-actions/actions/tempo-export/hours?date=${date}`);
      setHoursStatus(data);
      setHoursFetchError(false);
    } catch (err) {
      // Silently fail but indicate error
      console.error('Failed to fetch hours for date:', err);
      setHoursStatus(null);
      setHoursFetchError(true);
    }
  }, []);

  // Fetch hours when modal opens or date changes
  useEffect(() => {
    if (isOpen && startDate) {
      fetchHoursForDate(startDate);
    }
  }, [isOpen, startDate, fetchHoursForDate]);
  
  // Reset form to initial state
  const resetForm = useCallback(() => {
    setStartDate(moment().startOf('day').format('YYYY-MM-DD'));
    setHoursInput('');
    setHoursError('');
    setDescription('');
    setHoursStatus(null);
    setHoursFetchError(false);
  }, []);
  
  // Handle date change - extract just the date part if it's an ISO string
  const handleDateChange = useCallback((value) => {
    const dateOnly = value && value.includes('T') ? value.split('T')[0] : value;
    setStartDate(dateOnly);
  }, []);

  const closeModal = useCallback(() => {
    onClose();
  }, [onClose]);

  const validateHours = useCallback((value) => {
    const minutes = parseDurationToMinutes(value);
    if (value.trim() === '') {
      setHoursError(t('tempoExport.hoursRequired'));
      return null;
    }
    if (minutes === null) {
      setHoursError(t('tempoExport.hoursInvalid'));
      return null;
    }
    if (minutes <= 0) {
      setHoursError(t('tempoExport.hoursPositive'));
      return null;
    }
    setHoursError('');
    return minutes;
  }, [t]);

  const handleExport = async () => {
    const durationMinutes = validateHours(hoursInput);
    if (durationMinutes == null) return;

    setIsSubmitting(true);
    try {
      await api.post(TEMPO_EXPORT_URL, {
        startDate,
        durationMinutes,
        taskKey: TASK_KEY,
        description: description.trim() || undefined,
      });
      toast.success(t('tempoExport.exportSuccess'));
      resetForm(); // Clear form on success
      if (onSubmitted) onSubmitted(); // Notify parent to refresh hours
      closeModal();
    } catch (err) {
      toast.error(err?.message || t('tempoExport.exportFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleExport();
  };

  const handleHoursBlur = () => {
    if (hoursInput.trim()) validateHours(hoursInput);
  };

  const handleCancel = () => {
    closeModal();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      testid="modal:tempo-export"
      isOpen={isOpen}
      onClose={closeModal}
      width={480}
      withCloseIcon
      renderContent={() => (
        <ModalContents>
          <ModalHeader>
            <HeaderRow>
              <TaskKeyBadge>{TASK_KEY}</TaskKeyBadge>
              <ModalTitle>{t('tempoExport.title')}</ModalTitle>
            </HeaderRow>
            <TaskSummary>{t('tempoExport.taskSummary')}</TaskSummary>
          </ModalHeader>

          <form onSubmit={handleSubmit}>
            <FormBody>
              {hoursStatus?.hoursLogged >= 8 && (
                <WarningBanner>
                  <span className="warning-icon">⚠️</span>
                  {t('tempoExport.hoursCompleteWarning', { hours: hoursStatus.hoursLogged })}
                </WarningBanner>
              )}

              <Field>
                <Label id="tempo-export-date-label">{t('tempoExport.date')} *</Label>
                <DatePickerWrapper>
                  <DatePicker
                    withTime={false}
                    label={t('tempoExport.date')}
                    value={startDate}
                    onChange={handleDateChange}
                    placeholder="Select date"
                    aria-labelledby="tempo-export-date-label"
                  />
                  {hoursFetchError && (
                    <Hint $error>{t('tempoExport.hoursFetchError')}</Hint>
                  )}
                </DatePickerWrapper>
              </Field>

              <Field>
                <Label id="tempo-export-duration-label">{t('tempoExport.duration')} *</Label>
                <InputWrapper>
                  <Input
                    value={hoursInput}
                    onChange={setHoursInput}
                    onBlur={handleHoursBlur}
                    placeholder={t('tempoExport.durationPlaceholder')}
                    invalid={!!hoursError}
                    aria-labelledby="tempo-export-duration-label"
                    aria-invalid={!!hoursError}
                    aria-describedby={hoursError ? 'tempo-export-duration-error' : undefined}
                  />
                  <Hint>{t('tempoExport.durationHint')}</Hint>
                  {hoursError && <Hint id="tempo-export-duration-error" $error>{hoursError}</Hint>}
                </InputWrapper>
              </Field>

              <Field>
                <Label id="tempo-export-description-label">{t('tempoExport.description')}</Label>
                <DescriptionWrapper>
                  <Input
                    value={description}
                    onChange={setDescription}
                    placeholder={t('tempoExport.descriptionPlaceholder')}
                    aria-labelledby="tempo-export-description-label"
                  />
                </DescriptionWrapper>
              </Field>

              <Actions>
                <ActionsRight>
                  <Button type="button" variant="empty" onClick={handleCancel}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" variant="primary" isWorking={isSubmitting}>
                    {t('tempoExport.exportButton')}
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
