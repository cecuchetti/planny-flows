import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import dayjs from 'shared/utils/dayjs';

import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { TimeEntry } from 'shared/components';

const WORKLOGS_URL = '/api/v1/jira/worklogs';
const ISSUES_URL = '/api/v1/jira/issues';

// Re-export utils for backward compatibility
export { parseHoursToSeconds } from 'shared/components/TimeEntry/utils';

const propTypes = {
  issue: PropTypes.shape({
    key: PropTypes.string.isRequired,
    summary: PropTypes.string,
    status: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func, // eslint-disable-line react/require-default-props
};

export default function TimeEntryModal({ issue, onClose, onSaved = () => {} }) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const [closeTransitionId, setCloseTransitionId] = useState(null);
  const [isClosing, setIsClosing] = useState(false);

  // Check if issue can be closed
  useEffect(() => {
    const statusLower = (issue.status || '').toLowerCase();
    if (statusLower.includes('progress') || statusLower.includes('pending deployment')) {
      api
        .get(`${ISSUES_URL}/${issue.key}/transitions`)
        .then((data) => {
          const transitions = data.transitions || [];
          const closeTransition = transitions.find(
            (transition) =>
              transition.toStatus &&
              (transition.toStatus.toLowerCase() === 'closed' ||
                transition.toStatus.toLowerCase() === 'done'),
          );
          if (closeTransition) {
            setCanClose(true);
            setCloseTransitionId(closeTransition.id);
          }
        })
        .catch(() => {});
    }
  }, [issue.key, issue.status]);

  const handleSubmit = useCallback(
    async (formData) => {
      const { parsedTime, date, description } = formData;

      const startedAt = dayjs(date).utc().format();
      setIsSubmitting(true);

      try {
        await api.post(WORKLOGS_URL, {
          target: 'JIRA',
          externalIssueKey: issue.key,
          timeSpentSeconds: parsedTime,
          description,
          startedAt,
        });
        toast.success(t('timeEntry.saved'));
        onSaved();
        onClose();
      } catch (err) {
        toast.error(err?.message || t('timeEntry.saveFailed'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [issue.key, onSaved, onClose, t],
  );

  const handleCloseIssue = useCallback(async () => {
    if (!closeTransitionId) return;
    setIsClosing(true);
    try {
      await api.post(`${ISSUES_URL}/${issue.key}/transitions`, { transitionId: closeTransitionId });
      toast.success(t('timeEntry.issueClosed'));
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.message || t('timeEntry.closeFailed'));
    } finally {
      setIsClosing(false);
    }
  }, [closeTransitionId, issue.key, onSaved, onClose, t]);

  return (
    <TimeEntry
      isOpen
      onClose={onClose}
      onSubmit={handleSubmit}
      title={t('timeEntry.title')}
      entityKey={issue.key}
      entitySummary={issue.summary}
      showDescription
      withTime={true}
      timeMode="seconds"
      submitButtonText={t('common.save')}
      cancelButtonText={t('common.cancel')}
      canCloseEntity={canClose}
      closeEntityText={t('timeEntry.closeIssue')}
      onCloseEntity={handleCloseIssue}
      isSubmitting={isSubmitting}
      isClosingEntity={isClosing}
      testid="modal:time-entry"
      width={460}
    />
  );
}

TimeEntryModal.propTypes = propTypes;
