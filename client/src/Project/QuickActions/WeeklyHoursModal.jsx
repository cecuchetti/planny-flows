import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'shared/utils/dayjs';

import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { Modal, Button, Icon, Spinner } from 'shared/components';

import {
  ModalContents,
  ModalHeader,
  HeaderRow,
  TaskKeyBadge,
  ModalTitle,
  TaskSummary,
  FormBody,
  WeekGrid,
  DayCard,
  DayHeader,
  DayName,
  DayDate,
  HoursInput,
  StatusBadge,
  TotalRow,
  TotalLabel,
  TotalValue,
  Actions,
  ActionsRight,
  LoadingOverlay,
  DayLoading,
} from './WeeklyHoursModalStyles';

const WEEK_HOURS_URL = '/quick-actions/actions/tempo-export/week';
const UPDATE_HOURS_URL = '/quick-actions/actions/tempo-export/hours';
const TASK_KEY = 'VIS-2';

/**
 * Get the current week (Monday to Sunday)
 */
function getCurrentWeek() {
  const startOfWeek = dayjs().startOf('isoWeek');
  const days = [];

  for (let i = 0; i < 7; i += 1) {
    const day = startOfWeek.add(i, 'day');
    days.push({
      date: day.format('YYYY-MM-DD'),
      dayName: day.format('ddd'),
      dayNumber: day.format('D'),
      isToday: day.isSame(dayjs(), 'day'),
      isPast: day.isBefore(dayjs(), 'day'),
      isFuture: day.isAfter(dayjs(), 'day'),
    });
  }

  return days;
}

/**
 * Format hours for display (convert from hours decimal)
 */
function formatHours(hours) {
  if (hours == null || hours === 0) return '0';
  return hours.toString();
}

/**
 * Parse hours input to decimal
 */
function parseHoursInput(value) {
  if (!value || value.trim() === '') return 0;
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return parsed;
}

export default function WeeklyHoursModal({ isOpen = false, onClose, onSubmitted }) {
  const { t } = useTranslation();
  const [weekData, setWeekData] = useState([]);
  const [hoursByDate, setHoursByDate] = useState({});
  const [editingDate, setEditingDate] = useState(null);
  const [savingDate, setSavingDate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const inputRefs = useRef({});

  // Fetch week hours
  const fetchWeekHours = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get(WEEK_HOURS_URL);
      setWeekData(data.days || []);

      // Build hours map from response
      const hoursMap = {};
      (data.days || []).forEach((day) => {
        hoursMap[day.date] = day.hoursLogged || 0;
      });
      setHoursByDate(hoursMap);
    } catch (err) {
      console.error('Failed to fetch week hours:', err);
      // Initialize with current week days even on error
      const weekDays = getCurrentWeek();
      setWeekData(weekDays);
      const hoursMap = {};
      weekDays.forEach((day) => {
        hoursMap[day.date] = 0;
      });
      setHoursByDate(hoursMap);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch hours when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchWeekHours();
    }
  }, [isOpen, fetchWeekHours]);

  // Calculate total hours
  const totalHours = Object.values(hoursByDate).reduce((sum, h) => sum + (h || 0), 0);

  // Get week days (use fetched data or fallback to current week)
  const weekDays = weekData.length > 0 ? weekData : getCurrentWeek();

  // Handle hours change
  const handleHoursChange = useCallback((date, value) => {
    const hours = parseHoursInput(value);
    if (hours !== null) {
      setHoursByDate((prev) => ({
        ...prev,
        [date]: hours,
      }));
    }
  }, []);

  // Save hours for a specific date
  const saveHours = useCallback(
    async (date) => {
      const hours = hoursByDate[date];

      setSavingDate(date);
      try {
        await api.put(UPDATE_HOURS_URL, {
          date,
          hours,
          taskKey: TASK_KEY,
        });
        toast.success(t('weeklyHours.hoursSaved'));
        if (onSubmitted) onSubmitted();
      } catch (err) {
        toast.error(err?.message || t('weeklyHours.saveFailed'));
        // Revert on error
        fetchWeekHours();
      } finally {
        setSavingDate(null);
        setEditingDate(null);
      }
    },
    [hoursByDate, t, onSubmitted, fetchWeekHours],
  );

  // Handle input blur
  const handleBlur = useCallback(
    (date) => {
      saveHours(date);
    },
    [saveHours],
  );

  // Handle key press (Enter to save)
  const handleKeyPress = useCallback(
    (e, date) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (inputRefs.current[date]) {
          inputRefs.current[date].blur();
        }
        saveHours(date);
      }
    },
    [saveHours],
  );

  // Handle focus
  const handleFocus = useCallback((date) => {
    setEditingDate(date);
  }, []);

  // Close modal
  const closeModal = useCallback(() => {
    onClose();
  }, [onClose]);

  // Get status for a day
  const getDayStatus = useCallback(
    (day) => {
      const hours = hoursByDate[day.date] || 0;

      // Future days - no status
      if (day.isFuture) return null;

      // Past days with 0 hours - incomplete
      if (day.isPast && hours === 0) return 'incomplete';

      // Complete (8+ hours)
      if (hours >= 8) return 'complete';

      // In progress (some hours but not 8)
      if (hours > 0) return 'inProgress';

      // Today with 0 hours
      return 'incomplete';
    },
    [hoursByDate],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      testid="modal:weekly-hours"
      isOpen={isOpen}
      onClose={closeModal}
      width={700}
      withCloseIcon
      renderContent={() => (
        <ModalContents>
          <ModalHeader>
            <HeaderRow>
              <TaskKeyBadge>{TASK_KEY}</TaskKeyBadge>
              <ModalTitle>{t('weeklyHours.title')}</ModalTitle>
            </HeaderRow>
            <TaskSummary>{t('weeklyHours.subtitle')}</TaskSummary>
          </ModalHeader>

          <FormBody>
            {isLoading && (
              <LoadingOverlay>
                <Spinner size={24} />
              </LoadingOverlay>
            )}

            <WeekGrid>
              {weekDays.map((day) => {
                const status = getDayStatus(day);
                const hours = hoursByDate[day.date] || 0;
                const isSaving = savingDate === day.date;

                return (
                  <DayCard
                    key={day.date}
                    $isToday={day.isToday}
                    $isPast={day.isPast && hours === 0}
                    $isFuture={day.isFuture}
                  >
                    <DayHeader>
                      <DayName $isToday={day.isToday}>
                        {t(`weeklyHours.days.${day.dayName.toLowerCase()}`, day.dayName)}
                      </DayName>
                      <DayDate $isToday={day.isToday}>{day.dayNumber}</DayDate>
                    </DayHeader>

                    <HoursInput
                      ref={(el) => {
                        inputRefs.current[day.date] = el;
                      }}
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={formatHours(hours)}
                      onChange={(e) => handleHoursChange(day.date, e.target.value)}
                      onBlur={() => handleBlur(day.date)}
                      onKeyPress={(e) => handleKeyPress(e, day.date)}
                      onFocus={() => handleFocus(day.date)}
                      disabled={day.isFuture || isSaving}
                      $isEditing={editingDate === day.date}
                    />

                    {isSaving && (
                      <DayLoading>
                        <Spinner size={14} />
                      </DayLoading>
                    )}

                    {status && !isSaving && (
                      <StatusBadge $status={status}>
                        {status === 'complete' && (
                          <React.Fragment>
                            <Icon type="task" size={10} />
                            {t('weeklyHours.status.complete')}
                          </React.Fragment>
                        )}
                        {status === 'inProgress' && (
                          <React.Fragment>
                            <Icon type="stopwatch" size={10} />
                            {t('weeklyHours.status.inProgress')}
                          </React.Fragment>
                        )}
                        {status === 'incomplete' && (
                          <React.Fragment>
                            <Icon type="help" size={10} />
                            {t('weeklyHours.status.incomplete')}
                          </React.Fragment>
                        )}
                      </StatusBadge>
                    )}
                  </DayCard>
                );
              })}
            </WeekGrid>

            <TotalRow>
              <TotalLabel>{t('weeklyHours.totalHours')}</TotalLabel>
              <TotalValue $isComplete={totalHours >= 40}>
                {totalHours.toFixed(1)}h{totalHours >= 40 && <span className="check-icon">✓</span>}
              </TotalValue>
            </TotalRow>

            <Actions>
              <ActionsRight>
                <Button type="button" variant="empty" onClick={closeModal}>
                  {t('common.close')}
                </Button>
              </ActionsRight>
            </Actions>
          </FormBody>
        </ModalContents>
      )}
    />
  );
}
