import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'shared/utils/dayjs';

import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { Icon, Spinner } from 'shared/components';

import {
  Page,
  PageHeader,
  PageTitle,
  ActionGrid,
  ActionCard,
  CardIconWrap,
  CardTitle,
  CardSubtitle,
  HoursStatus,
  HoursFetchError,
} from './Styles';
import TempoExportModal from './TempoExportModal';
import WeeklyHoursModal from './WeeklyHoursModal';

const ACTIONS = [
  {
    id: 'outlook-clean',
    titleKey: 'quickActions.actions.outlookClean.title',
    subtitleKey: 'quickActions.actions.outlookClean.subtitle',
    iconType: 'trash',
    iconBg: '#E44D42',
    iconColor: '#fff',
    endpoint: '/quick-actions/actions/outlook-clean',
    statusEndpoint: '/quick-actions/actions/outlook-clean/status',
  },
  {
    id: 'tempo-export',
    titleKey: 'quickActions.actions.logHours.title',
    subtitleKey: 'quickActions.actions.logHours.subtitle',
    iconType: 'reports',
    iconBg: '#6554C0',
    iconColor: '#fff',
  },
  {
    id: 'weekly-hours',
    titleKey: 'quickActions.actions.weeklyHours.title',
    subtitleKey: 'quickActions.actions.weeklyHours.subtitle',
    iconType: 'calendar',
    iconBg: '#0B875B',
    iconColor: '#fff',
  },
  {
    id: 'placeholder-2',
    titleKey: 'quickActions.actions.archiveOld.title',
    subtitleKey: 'quickActions.actions.archiveOld.subtitle',
    iconType: 'page',
    iconBg: '#6B7280',
    iconColor: '#fff',
    placeholder: true,
  },
];

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 90000;

export default function QuickActions() {
  const { t } = useTranslation();
  const [loadingId, setLoadingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWeeklyModalOpen, setIsWeeklyModalOpen] = useState(false);
  const [todayHoursStatus, setTodayHoursStatus] = useState(null);
  const [hoursFetchError, setHoursFetchError] = useState(false);
  const [isLoadingHours, setIsLoadingHours] = useState(true);
  const pollTimeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  // Fetch hours logged today for VIS-2
  const fetchTodayHours = useCallback(async () => {
    setIsLoadingHours(true);
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const data = await api.get(`/quick-actions/actions/tempo-export/hours?date=${today}`);
      setTodayHoursStatus(data);
      setHoursFetchError(false);
    } catch (err) {
      // Silently fail - don't block the UI but indicate error
      console.error('Failed to fetch hours:', err);
      setHoursFetchError(true);
    } finally {
      setIsLoadingHours(false);
    }
  }, []);

  // Fetch hours on mount
  useEffect(() => {
    fetchTodayHours();
  }, [fetchTodayHours]);

  // Refresh hours when modal closes (in case new hours were submitted)
  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    fetchTodayHours();
  }, [fetchTodayHours]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (isMountedRef.current) {
      setLoadingId(null);
    }
  }, []);

  const handleAction = async (action) => {
    if (action.placeholder) {
      toast.show({ title: t('quickActions.actions.notImplemented') });
      return;
    }

    if (action.id === 'tempo-export') {
      setIsModalOpen(true);
      return;
    }

    if (action.id === 'weekly-hours') {
      setIsWeeklyModalOpen(true);
      return;
    }

    setLoadingId(action.id);
    stopPolling();

    try {
      const data = await api.post(action.endpoint);

      if (data?.accepted) {
        toast.show({ title: t('quickActions.actions.outlookClean.running') });

        const start = Date.now();
        pollIntervalRef.current = setInterval(async () => {
          // Check if component is still mounted before any state updates
          if (!isMountedRef.current) {
            stopPolling();
            return;
          }

          if (Date.now() - start > POLL_TIMEOUT_MS) {
            stopPolling();
            toast.error(t('quickActions.actions.error'));
            return;
          }
          try {
            const statusData = await api.get(action.statusEndpoint);

            // Check mount state again after async operation
            if (!isMountedRef.current) {
              stopPolling();
              return;
            }

            const { status, lastRun } = statusData || {};

            if (status === 'success') {
              stopPolling();
              toast.success(t('quickActions.actions.outlookClean.success'));
              return;
            }
            if (status === 'failed' && lastRun?.message) {
              stopPolling();
              toast.error(
                t('quickActions.actions.outlookClean.failed', { message: lastRun.message }),
              );
              return;
            }
            if (status === 'failed') {
              stopPolling();
              toast.error(
                t('quickActions.actions.outlookClean.failed', {
                  message: t('quickActions.actions.error'),
                }),
              );
            }
          } catch (_) {
            // Keep polling on network errors
          }
        }, POLL_INTERVAL_MS);

        pollTimeoutRef.current = setTimeout(() => {
          stopPolling();
          toast.error(t('quickActions.actions.error'));
        }, POLL_TIMEOUT_MS);
        return;
      }

      setLoadingId(null);
    } catch (err) {
      const message = err?.message || t('quickActions.actions.error');
      toast.error(message);
      setLoadingId(null);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  return (
    <Page>
      <PageHeader>
        <PageTitle>{t('quickActions.pageTitle')}</PageTitle>
      </PageHeader>

      <ActionGrid>
        {ACTIONS.map((action) => (
          <ActionCard
            key={action.id}
            type="button"
            onClick={() => handleAction(action)}
            disabled={!action.placeholder && loadingId !== null}
          >
            <CardIconWrap $bg={action.iconBg} $color={action.iconColor}>
              <Icon type={action.iconType} size={22} />
            </CardIconWrap>
            <CardTitle>{t(action.titleKey)}</CardTitle>
            <CardSubtitle>{t(action.subtitleKey)}</CardSubtitle>
            {action.id === 'tempo-export' && isLoadingHours && (
              <HoursStatus>
                <Spinner size={14} />
              </HoursStatus>
            )}
            {action.id === 'tempo-export' &&
              !isLoadingHours &&
              todayHoursStatus?.hoursLogged > 0 && (
                <HoursStatus $isComplete={todayHoursStatus.isComplete}>
                  {t('tempoExport.hoursLoggedToday', { hours: todayHoursStatus.hoursLogged })}
                </HoursStatus>
              )}
            {action.id === 'tempo-export' && hoursFetchError && (
              <HoursFetchError>
                <Icon type="alert" size={12} />
                {t('tempoExport.hoursFetchError')}
              </HoursFetchError>
            )}
          </ActionCard>
        ))}
      </ActionGrid>

      <TempoExportModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmitted={fetchTodayHours}
      />

      <WeeklyHoursModal
        isOpen={isWeeklyModalOpen}
        onClose={() => setIsWeeklyModalOpen(false)}
        onSubmitted={fetchTodayHours}
      />
    </Page>
  );
}
