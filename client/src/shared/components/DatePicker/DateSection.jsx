import React, { useState } from 'react';
import PropTypes from 'prop-types';
import moment from 'moment';
import { times, range } from 'lodash';

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



const DatePickerDateSection = ({ withTime = true, value = undefined, onChange, setDropdownOpen }) => {
  const [selectedMonth, setSelectedMonth] = useState(moment(value).startOf('month'));

  const handleYearChange = year => {
    setSelectedMonth(moment(selectedMonth).set({ year: Number(year) }));
  };

  const handleMonthChange = addOrSubtract => {
    setSelectedMonth(moment(selectedMonth)[addOrSubtract](1, 'month'));
  };

  const handleDayChange = newDate => {
    // When withTime=false, always use 16:30 as the default time
    // When withTime=true, preserve the existing time or default to 16:30
    const defaultHour = 16;
    const defaultMinute = 30;

    const existingHour = value ? moment(value).hour() : defaultHour;
    const existingMinute = value ? moment(value).minute() : defaultMinute;

    const newDateWithExistingTime = newDate.set({
      hour: withTime ? existingHour : defaultHour,
      minute: withTime ? existingMinute : defaultMinute,
    });
    onChange(formatDateTimeForAPI(newDateWithExistingTime));

    if (!withTime) {
      setDropdownOpen(false);
    }
  };

  return (
    <DateSection>
      <SelectedMonthYear>{formatDate(selectedMonth, 'MMM YYYY')}</SelectedMonthYear>

      <YearSelect onChange={event => handleYearChange(event.target.value)}>
        {generateYearOptions().map(option => (
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
        {generateWeekDayNames().map(name => (
          <DayName key={name}>{name}</DayName>
        ))}
        {generateFillerDaysBeforeMonthStart(selectedMonth).map(i => (
          <Day key={`before-${i}`} isFiller />
        ))}
        {generateMonthDays(selectedMonth).map(date => (
          <Day
            key={date}
            isToday={moment().isSame(date, 'day')}
            isSelected={moment(value).isSame(date, 'day')}
            onClick={() => handleDayChange(date)}
          >
            {formatDate(date, 'D')}
          </Day>
        ))}
        {generateFillerDaysAfterMonthEnd(selectedMonth).map(i => (
          <Day key={`after-${i}`} isFiller />
        ))}
      </Grid>
    </DateSection>
  );
};

const currentYear = moment().year();

const generateYearOptions = () => [
  { label: 'Year', value: '' },
  ...times(50, i => ({ label: `${i + currentYear - 10}`, value: `${i + currentYear - 10}` })),
];

const generateWeekDayNames = () => moment.weekdaysMin(true);

const generateFillerDaysBeforeMonthStart = selectedMonth => {
  const count = selectedMonth.diff(moment(selectedMonth).startOf('week'), 'days');
  return range(count);
};

const generateMonthDays = selectedMonth =>
  times(selectedMonth.daysInMonth()).map(i => moment(selectedMonth).add(i, 'days'));

const generateFillerDaysAfterMonthEnd = selectedMonth => {
  const selectedMonthEnd = moment(selectedMonth).endOf('month');
  const weekEnd = moment(selectedMonthEnd).endOf('week');
  const count = weekEnd.diff(selectedMonthEnd, 'days');
  return range(count);
};

DatePickerDateSection.propTypes = propTypes;

export default DatePickerDateSection;
