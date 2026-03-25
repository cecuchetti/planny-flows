import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import moment from 'moment';
import 'moment/locale/es';
import styled from 'styled-components';

import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { Modal, Button, Input } from 'shared/components';

/* eslint-disable react/require-default-props */

import {
  ModalContents,
  ModalHeader,
  ModalTitle,
  FormBody,
  Actions,
  ActionsRight,
} from './TimeEntryModalStyles';

const CalendarWrap = styled.div`
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #f8fafc;
`;

const CalendarGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: auto auto;
  gap: 0;
`;

const CalendarCellHeader = styled.div`
  padding: 10px 6px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  background: #f1f5f9;
  border-right: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  &:nth-child(7n) {
    border-right: none;
  }
`;

const CalendarCell = styled.div`
  padding: 12px 8px;
  min-height: 80px;
  background: #fff;
  border-right: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  &:nth-child(7n) {
    border-right: none;
  }
`;

const CalendarDate = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: #334155;
  line-height: 1;
`;

const CalendarInputWrap = styled.div`
  width: 100%;
  input {
    text-align: center;
    padding: 6px 4px;
    font-size: 14px;
    font-weight: 500;
  }
`;

const WORKLOGS_HOURS_BY_DATE_URL = '/api/v1/jira/worklogs/hours-by-date';

function getWeekStartEnd() {
  const monday = moment().clone().isoWeekday(1);
  const sunday = monday.clone().add(6, 'days');
  return {
    from: monday.format('YYYY-MM-DD'),
    to: sunday.format('YYYY-MM-DD'),
  };
}

function getWeekDays(fromDate) {
  const start = moment(fromDate, 'YYYY-MM-DD');
  return Array.from({ length: 7 }, (_, i) => start.clone().add(i, 'days'));
}

function secondsToHours(seconds) {
  if (seconds == null || seconds === 0) return '';
  const h = seconds / 3600;
  return h % 1 === 0 ? String(h) : h.toFixed(2);
}

function hoursToSeconds(value) {
  if (value == null || value === '') return 0;
  const num = parseFloat(String(value).replace(',', '.'), 10);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 3600);
}

const propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
};



export default function HoursByDateModal({ isOpen, onClose, onSaved = () => {} }) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(null);
  const [localValues, setLocalValues] = useState({});

  useEffect(() => {
    const lang = i18n.language && i18n.language.startsWith('es') ? 'es' : 'en';
    moment.locale(lang);
  }, [i18n.language]);

  const { from, to } = getWeekStartEnd();
  const weekDays = getWeekDays(from);

  const fetchHours = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(WORKLOGS_HOURS_BY_DATE_URL, { from, to });
      const list = res.items || [];
      setItems(list);
      const byDate = {};
      list.forEach((row) => {
        byDate[row.workDate] = secondsToHours(row.totalSeconds);
      });
      setLocalValues(byDate);
    } catch (err) {
      toast.error(err?.message || 'Failed to load hours');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (isOpen) fetchHours();
  }, [isOpen, fetchHours]);

  const handleDayChange = (dateStr, inputValue) => {
    setLocalValues((prev) => ({ ...prev, [dateStr]: inputValue }));
  };

  const handleDayBlur = useCallback(
    async (dateStr, currentValue) => {
      const totalSeconds = hoursToSeconds(currentValue);
      const prev = items.find((r) => r.workDate === dateStr);
      const prevSeconds = prev ? prev.totalSeconds : 0;
      if (totalSeconds === prevSeconds) return;

      setSaving(dateStr);
      try {
        await api.patch(`${WORKLOGS_HOURS_BY_DATE_URL}/${dateStr}`, { totalSeconds });
        setItems((prev) => {
          const rest = prev.filter((r) => r.workDate !== dateStr);
          return [...rest, { workDate: dateStr, totalSeconds }].sort(
            (a, b) => a.workDate.localeCompare(b.workDate)
          );
        });
        toast.success(t('myJiraIssues.hoursSaved'));
        onSaved();
      } catch (err) {
        toast.error(err?.message || 'Failed to update hours');
      } finally {
        setSaving(null);
      }
    },
    [items, onSaved, t]
  );

  return (
    <Modal
      testid="modal:hours-by-date"
      isOpen={isOpen}
      onClose={onClose}
      width={600}
      withCloseIcon
      renderContent={({ close }) => (
        <ModalContents>
          <ModalHeader>
            <ModalTitle>{t('myJiraIssues.hoursWeekTitle')}</ModalTitle>
          </ModalHeader>

          <FormBody>
            {loading ? (
              <p style={{ margin: 0, color: '#64748b' }}>Loading...</p>
            ) : (
              <CalendarWrap>
                <CalendarGrid>
                  {weekDays.map((day) => (
                    <CalendarCellHeader key={`h-${day.format('YYYY-MM-DD')}`}>
                      {day.format('ddd')}
                    </CalendarCellHeader>
                  ))}
                  {weekDays.map((day) => {
                    const dateStr = day.format('YYYY-MM-DD');
                    const value = localValues[dateStr] ?? '';
                    const isSaving = saving === dateStr;
                    return (
                      <CalendarCell key={dateStr}>
                        <CalendarDate>{day.format('D')}</CalendarDate>
                        <CalendarInputWrap>
                          <Input
                            value={value}
                            onChange={(v) => handleDayChange(dateStr, v)}
                            onBlur={() => handleDayBlur(dateStr, value)}
                            placeholder={t('myJiraIssues.hoursEditPlaceholder')}
                            disabled={isSaving}
                          />
                        </CalendarInputWrap>
                      </CalendarCell>
                    );
                  })}
                </CalendarGrid>
              </CalendarWrap>
            )}

            <Actions>
              <div />
              <ActionsRight>
                <Button variant="empty" onClick={close}>
                  {t('common.cancel')}
                </Button>
                <Button variant="primary" onClick={close}>
                  {t('common.closeDialog')}
                </Button>
              </ActionsRight>
            </Actions>
          </FormBody>
        </ModalContents>
      )}
    />
  );
}

HoursByDateModal.propTypes = propTypes;
