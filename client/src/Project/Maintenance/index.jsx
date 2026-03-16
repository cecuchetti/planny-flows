import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import moment from 'moment';

import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { Icon } from 'shared/components';

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

const ACTIONS = [
  {
    id: 'outlook-clean',
    titleKey: 'maintenance.actions.outlookClean.title',
    subtitleKey: 'maintenance.actions.outlookClean.subtitle',
    iconType: 'trash',
    iconBg: '#E44D42',
    iconColor: '#fff',
    endpoint: '/maintenance/actions/outlook-clean',
    statusEndpoint: '/maintenance/actions/outlook-clean/status',
  },
  {
    id: 'tempo-export',
    titleKey: 'maintenance.actions.logHours.title',
    subtitleKey: 'maintenance.actions.logHours.subtitle',
    iconType: 'reports',
    iconBg: '#6554C0',
    iconColor: '#fff',
  },
  {
    id: 'placeholder-2',
    titleKey: 'maintenance.actions.archiveOld.title',
    subtitleKey: 'maintenance.actions.archiveOld.subtitle',
    iconType: 'calendar',
    iconBg: '#0B875B',
    iconColor: '#fff',
    placeholder: true,
  },
];

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 90000;

export default function Maintenance() {
  const { t } = useTranslation();
  const [loadingId, setLoadingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [todayHoursStatus, setTodayHoursStatus] = useState(null);
  const [hoursFetchError, setHoursFetchError] = useState(false);
  const pollTimeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  // Fetch hours logged today for VIS-2
  const fetchTodayHours = useCallback(async () => {
    try {
      const today = moment().format('YYYY-MM-DD');
      const data = await api.get(`/maintenance/actions/tempo-export/hours?date=${today}`);
      setTodayHoursStatus(data);
      setHoursFetchError(false);
    } catch (err) {
      // Silently fail - don't block the UI but indicate error
      console.error('Failed to fetch hours:', err);
      setHoursFetchError(true);
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
      toast.show({ title: t('maintenance.actions.notImplemented') });
      return;
    }

    if (action.id === 'tempo-export') {
      setIsModalOpen(true);
      return;
    }

    setLoadingId(action.id);
    stopPolling();

    try {
      const data = await api.post(action.endpoint);

      if (data?.accepted) {
        toast.show({ title: t('maintenance.actions.outlookClean.running') });

        const start = Date.now();
        pollIntervalRef.current = setInterval(async () => {
          // Check if component is still mounted before any state updates
          if (!isMountedRef.current) {
            stopPolling();
            return;
          }
          
          if (Date.now() - start > POLL_TIMEOUT_MS) {
            stopPolling();
            toast.error(t('maintenance.actions.error'));
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
              toast.success(t('maintenance.actions.outlookClean.success'));
              return;
            }
            if (status === 'failed' && lastRun?.message) {
              stopPolling();
              toast.error(t('maintenance.actions.outlookClean.failed', { message: lastRun.message }));
              return;
            }
            if (status === 'failed') {
              stopPolling();
              toast.error(t('maintenance.actions.outlookClean.failed', { message: t('maintenance.actions.error') }));
            }
          } catch (_) {
            // Keep polling on network errors
          }
        }, POLL_INTERVAL_MS);

        pollTimeoutRef.current = setTimeout(() => {
          stopPolling();
          toast.error(t('maintenance.actions.error'));
        }, POLL_TIMEOUT_MS);
        return;
      }

      setLoadingId(null);
    } catch (err) {
      const message = err?.message || t('maintenance.actions.error');
      toast.error(message);
      setLoadingId(null);
    }
  };

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  return (
    <Page>
      <PageHeader>
        <PageTitle>{t('maintenance.pageTitle')}</PageTitle>
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
            {action.id === 'tempo-export' && todayHoursStatus?.hoursLogged > 0 && (
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
    </Page>
  );
}
