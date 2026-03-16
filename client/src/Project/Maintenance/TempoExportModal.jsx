import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import moment from 'moment';

import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { Modal, Button, DatePicker } from 'shared/components';

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
} from './TempoExportModalStyles';

const TEMPO_EXPORT_URL = '/maintenance/actions/tempo-export';
const TASK_KEY = 'VIS-2';

/**
 * Parse duration input: "2h", "2 h", "2.5h", "1h 30m", "30m" -> minutes or null if invalid.
 */
export function parseDurationToMinutes(input) {
  if (input == null || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/,/g, '.').toLowerCase();
  let totalMinutes = 0;

  const hMatch = normalized.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hMatch) {
    totalMinutes += parseFloat(hMatch[1], 10) * 60;
  }

  const mMatch = normalized.match(/(\d+(?:\.\d+)?)\s*m/);
  if (mMatch) {
    totalMinutes += parseFloat(mMatch[1], 10);
  }

  if (totalMinutes > 0) return totalMinutes;

  const onlyNumber = normalized.match(/^(\d+(?:\.\d+)?)\s*$/);
  if (onlyNumber) {
    const val = parseFloat(onlyNumber[1], 10);
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

  // Fetch hours for a specific date
  const fetchHoursForDate = useCallback(async (date) => {
    if (!date) return;
    try {
      const data = await api.get(`/maintenance/actions/tempo-export/hours?date=${date}`);
      setHoursStatus(data);
    } catch (err) {
      // Silently fail
      console.error('Failed to fetch hours for date:', err);
      setHoursStatus(null);
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

          <FormBody>
            {hoursStatus?.hoursLogged >= 8 && (
              <WarningBanner>
                <span className="warning-icon">⚠️</span>
                {t('tempoExport.hoursCompleteWarning', { hours: hoursStatus.hoursLogged })}
              </WarningBanner>
            )}

            <Field>
              <Label>{t('tempoExport.date')} *</Label>
              <div style={{ maxWidth: '250px' }}>
                <DatePicker
                  withTime={false}
                  label={t('tempoExport.date')}
                  value={startDate}
                  onChange={handleDateChange}
                  placeholder="Select date"
                />
              </div>
            </Field>

            <Field>
              <Label>{t('tempoExport.duration')} *</Label>
              <div style={{ maxWidth: '250px' }}>
                <input
                  type="text"
                  value={hoursInput}
                  onChange={(e) => setHoursInput(e.target.value)}
                  onBlur={handleHoursBlur}
                  placeholder={t('tempoExport.durationPlaceholder')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: hoursError ? '1px solid #e74c3c' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                />
                <Hint>{t('tempoExport.durationHint')}</Hint>
                {hoursError && <Hint style={{ color: '#e74c3c', fontWeight: '500' }}>{hoursError}</Hint>}
              </div>
            </Field>

            <Field>
              <Label>{t('tempoExport.description')}</Label>
              <div style={{ maxWidth: '400px' }}>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('tempoExport.descriptionPlaceholder')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                />
              </div>
            </Field>

            <Actions>
              <ActionsRight>
                <Button variant="empty" onClick={handleCancel}>
                  {t('common.cancel')}
                </Button>
                <Button variant="primary" isWorking={isSubmitting} onClick={handleExport}>
                  {t('tempoExport.exportButton')}
                </Button>
              </ActionsRight>
            </Actions>
          </FormBody>
        </ModalContents>
      )}
    />
  );
}
