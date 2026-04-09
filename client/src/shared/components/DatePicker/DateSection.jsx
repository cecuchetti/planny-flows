import React, { useState } from 'react';
import PropTypes from 'prop-types';
import range from 'lodash/range';
import times from 'lodash/times';

import dayjs from 'shared/utils/dayjs';
import { formatDate, formatDateTimeForAPI } from 'shared/utils/dateTime';
import Icon from 'shared/components/Icon';

import {
  DateSection,
  YearSelect,
  SelectedMonthYear,
  Grid,
  PrevNextIcons,
  DayName,
  Day,
} from './Styles';

/* eslint-disable react/require-default-props */

const propTypes = {
  withTime: PropTypes.bool,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  setDropdownOpen: PropTypes.func.isRequired,
};

const DatePickerDateSection = ({
  withTime = true,
  value = undefined,
  onChange,
  setDropdownOpen,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(dayjs(value).startOf('month'));

  const handleYearChange = (year) => {
    setSelectedMonth(selectedMonth.set('year', Number(year)));
  };

  const handleMonthChange = (addOrSubtract) => {
    setSelectedMonth(selectedMonth[addOrSubtract](1, 'month'));
  };

  const handleDayChange = (newDate) => {
    // When withTime=false, always use 16:30 as the default time
    // When withTime=true, preserve the existing time or default to 16:30
    const defaultHour = 16;
    const defaultMinute = 30;

    const existingHour = value ? dayjs(value).hour() : defaultHour;
    const existingMinute = value ? dayjs(value).minute() : defaultMinute;

    const newDateWithExistingTime = newDate
      .hour(withTime ? existingHour : defaultHour)
      .minute(withTime ? existingMinute : defaultMinute)
      .second(0)
      .millisecond(0);
    onChange(formatDateTimeForAPI(newDateWithExistingTime));

    if (!withTime) {
      setDropdownOpen(false);
    }
  };

  return (
    <DateSection>
      <SelectedMonthYear>{formatDate(selectedMonth, 'MMM YYYY')}</SelectedMonthYear>

      <YearSelect onChange={(event) => handleYearChange(event.target.value)}>
        {generateYearOptions().map((option) => (
          <option key={option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </YearSelect>

      <PrevNextIcons>
        <Icon type="arrow-left" onClick={() => handleMonthChange('subtract')} />
        <Icon type="arrow-right" onClick={() => handleMonthChange('add')} />
      </PrevNextIcons>

      <Grid>
        {generateWeekDayNames().map((name) => (
          <DayName key={name}>{name}</DayName>
        ))}
        {generateFillerDaysBeforeMonthStart(selectedMonth).map((i) => (
          <Day key={`before-${i}`} isFiller />
        ))}
        {generateMonthDays(selectedMonth).map((date) => (
          <Day
            key={date}
            isToday={dayjs().isSame(date, 'day')}
            isSelected={dayjs(value).isSame(date, 'day')}
            onClick={() => handleDayChange(date)}
          >
            {formatDate(date, 'D')}
          </Day>
        ))}
        {generateFillerDaysAfterMonthEnd(selectedMonth).map((i) => (
          <Day key={`after-${i}`} isFiller />
        ))}
      </Grid>
    </DateSection>
  );
};

const currentYear = dayjs().year();

const generateYearOptions = () => [
  { label: 'Year', value: '' },
  ...times(50, (i) => ({ label: `${i + currentYear - 10}`, value: `${i + currentYear - 10}` })),
];

const generateWeekDayNames = () =>
  range(7).map((index) => dayjs().startOf('isoWeek').add(index, 'day').format('dd'));

const generateFillerDaysBeforeMonthStart = (selectedMonth) => {
  const count = selectedMonth.diff(selectedMonth.startOf('isoWeek'), 'day');
  return range(count);
};

const generateMonthDays = (selectedMonth) =>
  times(selectedMonth.daysInMonth()).map((i) => selectedMonth.add(i, 'day'));

const generateFillerDaysAfterMonthEnd = (selectedMonth) => {
  const selectedMonthEnd = selectedMonth.endOf('month');
  const weekEnd = selectedMonthEnd.endOf('isoWeek');
  const count = weekEnd.diff(selectedMonthEnd, 'day');
  return range(count);
};

DatePickerDateSection.propTypes = propTypes;

export default DatePickerDateSection;
