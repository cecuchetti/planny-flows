import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import moment from 'moment';

import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { Modal, Button, Input, DatePicker } from 'shared/components';

import {
  ModalContents,
  ModalHeader,
  HeaderRow,
  IssueKeyBadge,
  ModalTitle,
  IssueSummary,
  FormBody,
  Field,
  Label,
  Hint,
  Actions,
  ActionsRight,
} from './TimeEntryModalStyles';

const WORKLOGS_URL = '/api/v1/jira/worklogs';
const ISSUES_URL = '/api/v1/jira/issues';

/**
 * Parse hours input: "2h", "2 h", "2.5h", "1h 30m", "30m" -> seconds or null if invalid.
 */
export function parseHoursToSeconds(input) {
  if (input == null || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/,/g, '.').toLowerCase();
  let totalSeconds = 0;

  const hMatch = normalized.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hMatch) {
    totalSeconds += parseFloat(hMatch[1], 10) * 3600;
  }

  const mMatch = normalized.match(/(\d+(?:\.\d+)?)\s*m/);
  if (mMatch) {
    totalSeconds += parseFloat(mMatch[1], 10) * 60;
  }

  if (totalSeconds > 0) return Math.round(totalSeconds);

  const onlyNumber = normalized.match(/^(\d+(?:\.\d+)?)\s*$/);
  if (onlyNumber) {
    const val = parseFloat(onlyNumber[1], 10);
    if (Number.isFinite(val) && val > 0) return Math.round(val * 3600);
  }

  return null;
}

const propTypes = {
  issue: PropTypes.shape({
    key: PropTypes.string.isRequired,
    summary: PropTypes.string,
    status: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
};

const defaultProps = {
  onSaved: () => {},
};

export default function TimeEntryModal({ issue, onClose, onSaved }) {
  const { t } = useTranslation();
  const [hoursInput, setHoursInput] = useState('');
  const [dateTime, setDateTime] = useState(() =>
    moment()
      .set({ hour: 16, minute: 30, second: 0, millisecond: 0 })
      .format('YYYY-MM-DDTHH:mm'),
  );
  const [description, setDescription] = useState('');
  const [hoursError, setHoursError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const [closeTransitionId, setCloseTransitionId] = useState(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const statusLower = (issue.status || '').toLowerCase();
    if (statusLower.includes('progress') || statusLower.includes('pending deployment')) {
      api.get(`${ISSUES_URL}/${issue.key}/transitions`)
        .then((data) => {
          const transitions = data.transitions || [];
          const closeTransition = transitions.find((t) => 
            t.toStatus && (t.toStatus.toLowerCase() === 'closed' || t.toStatus.toLowerCase() === 'done')
          );
          if (closeTransition) {
            setCanClose(true);
            setCloseTransitionId(closeTransition.id);
          }
        })
        .catch(() => {});
    }
  }, [issue.key, issue.status]);

  const validateHours = useCallback((value) => {
    const seconds = parseHoursToSeconds(value);
    if (value.trim() === '') {
      setHoursError(t('timeEntry.hoursRequired'));
      return null;
    }
    if (seconds === null) {
      setHoursError(t('timeEntry.hoursInvalid'));
      return null;
    }
    if (seconds <= 0) {
      setHoursError(t('timeEntry.hoursPositive'));
      return null;
    }
    setHoursError('');
    return seconds;
  }, [t]);

  const handleSave = async () => {
    const timeSpentSeconds = validateHours(hoursInput);
    if (timeSpentSeconds == null) return;

    const desc = description.trim();
    if (desc.length > 5000) {
      toast.error(t('timeEntry.descriptionTooLong'));
      return;
    }

    const startedAt = moment(dateTime).utc().format();
    setIsSubmitting(true);
    try {
      await api.post(WORKLOGS_URL, {
        target: 'JIRA',
        externalIssueKey: issue.key,
        timeSpentSeconds,
        description: desc,
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
  };

  const handleHoursBlur = () => {
    if (hoursInput.trim()) validateHours(hoursInput);
  };

  const handleCloseIssue = async () => {
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
  };

  return (
    <Modal
      testid="modal:time-entry"
      isOpen
      onClose={onClose}
      width={460}
      withCloseIcon
      renderContent={({ close }) => (
        <ModalContents>
          <ModalHeader>
            <HeaderRow>
              <IssueKeyBadge>{issue.key}</IssueKeyBadge>
              <ModalTitle>{t('timeEntry.title')}</ModalTitle>
            </HeaderRow>
            {issue.summary && (
              <IssueSummary>{issue.summary}</IssueSummary>
            )}
          </ModalHeader>

          <FormBody>
            <Field>
              <Label>{t('timeEntry.hoursLogged')} *</Label>
              <Input
                value={hoursInput}
                onChange={setHoursInput}
                onBlur={handleHoursBlur}
                placeholder="ej. 2h, 1h 30m, 2.5"
                invalid={!!hoursError}
              />
              <Hint>{t('timeEntry.hoursHint')}</Hint>
              {hoursError && <Hint $error>{hoursError}</Hint>}
            </Field>

            <Field>
              <Label>{t('timeEntry.dateAndTime')} *</Label>
              <DatePicker
                withTime
                value={dateTime}
                onChange={setDateTime}
              />
            </Field>

            <Field>
              <Label>{t('timeEntry.description')}</Label>
              <Input
                value={description}
                onChange={setDescription}
                placeholder={t('timeEntry.descriptionPlaceholder')}
              />
            </Field>

            <Actions>
              {canClose && (
                <Button variant="danger" isWorking={isClosing} onClick={handleCloseIssue}>
                  {t('timeEntry.closeIssue')}
                </Button>
              )}
              <ActionsRight>
                <Button variant="empty" onClick={close}>
                  {t('common.cancel')}
                </Button>
                <Button variant="primary" isWorking={isSubmitting} onClick={handleSave}>
                  {t('common.save')}
                </Button>
              </ActionsRight>
            </Actions>
          </FormBody>
        </ModalContents>
      )}
    />
  );
}

TimeEntryModal.propTypes = propTypes;
TimeEntryModal.defaultProps = defaultProps;
