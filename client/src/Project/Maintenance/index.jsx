import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

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
} from './Styles';

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
    id: 'placeholder-1',
    titleKey: 'maintenance.actions.exportReports.title',
    subtitleKey: 'maintenance.actions.exportReports.subtitle',
    iconType: 'reports',
    iconBg: '#6554C0',
    iconColor: '#fff',
    placeholder: true,
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
  const pollTimeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    setLoadingId(null);
  }, []);

  const handleAction = async (action) => {
    if (action.placeholder) {
      toast.show({ title: t('maintenance.actions.notImplemented') });
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
          if (Date.now() - start > POLL_TIMEOUT_MS) {
            stopPolling();
            toast.error(t('maintenance.actions.error'));
            return;
          }
          try {
            const statusData = await api.get(action.statusEndpoint);
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
              return;
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

  React.useEffect(() => () => stopPolling(), [stopPolling]);

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
          </ActionCard>
        ))}
      </ActionGrid>
    </Page>
  );
}
