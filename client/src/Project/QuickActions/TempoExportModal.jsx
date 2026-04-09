import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import moment from 'moment';

import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { TimeEntry } from 'shared/components';

const TEMPO_EXPORT_URL = '/quick-actions/actions/tempo-export';
const TASK_KEY = process.env.REACT_APP_TEMPO_TASK_KEY || 'VIS-2';

// Re-export utils for backward compatibility
export { parseDurationToMinutes } from 'shared/components/TimeEntry/utils';

export default function TempoExportModal({ isOpen = false, onClose, onSubmitted }) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hoursStatus, setHoursStatus] = useState(null);
  const [startDate, setStartDate] = useState(() =>
    moment().set({ hour: 16, minute: 30, second: 0, millisecond: 0 }).format('YYYY-MM-DDTHH:mm')
  );

  // Fetch hours for a specific date
  const fetchHoursForDate = useCallback(async (date) => {
    if (!date) return;
    try {
      const data = await api.get(`/quick-actions/actions/tempo-export/hours?date=${date}`);
      setHoursStatus(data);
    } catch (err) {
      // Silently fail but indicate error
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

  const handleSubmit = useCallback(async (formData) => {
    const { parsedTime, date, description } = formData;

    setIsSubmitting(true);
    try {
      await api.post(TEMPO_EXPORT_URL, {
        startDate: date,
        durationMinutes: parsedTime,
        taskKey: TASK_KEY,
        description: description.trim() || undefined,
      });
      toast.success(t('tempoExport.exportSuccess'));
      if (onSubmitted) onSubmitted();
      onClose();
    } catch (err) {
      toast.error(err?.message || t('tempoExport.exportFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }, [onClose, onSubmitted, t]);

  // Build warning message
  const warning = hoursStatus?.hoursLogged >= 8
    ? t('tempoExport.hoursCompleteWarning', { hours: hoursStatus.hoursLogged })
    : null;

  // Handle date change from TimeEntry component
  const handleDateChange = useCallback((date) => {
    setStartDate(date);
  }, []);

  return (
    <TimeEntry
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={t('tempoExport.title')}
      entityKey={TASK_KEY}
      entitySummary={t('tempoExport.taskSummary')}
      showDescription
      withTime={false}
      timeMode="minutes"
      submitButtonText={t('tempoExport.exportButton')}
      cancelButtonText={t('common.cancel')}
      warning={warning}
      isSubmitting={isSubmitting}
      testid="modal:tempo-export"
      width={480}
      // Override labels for Tempo context
      labels={{
        hours: t('tempoExport.duration'),
        date: t('tempoExport.date'),
        description: t('tempoExport.description'),
        hoursHint: t('tempoExport.durationHint'),
      }}
      placeholders={{
        hours: t('tempoExport.durationPlaceholder'),
        description: t('tempoExport.descriptionPlaceholder'),
      }}
      errorMessages={{
        hoursRequired: t('tempoExport.hoursRequired'),
        hoursInvalid: t('tempoExport.hoursInvalid'),
        hoursPositive: t('tempoExport.hoursPositive'),
      }}
      initialValues={{
        date: startDate,
      }}
      onDateChange={handleDateChange}
    />
  );
}
