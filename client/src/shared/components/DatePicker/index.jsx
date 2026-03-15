import React, { useState, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';

import { formatDate, formatDateTime } from 'shared/utils/dateTime';
import useOnOutsideClick from 'shared/hooks/onOutsideClick';
import Input from 'shared/components/Input';

import DateSection from './DateSection';
import TimeSection from './TimeSection';
import { StyledDatePicker, Dropdown } from './Styles';

const propTypes = {
  className: PropTypes.string,
  withTime: PropTypes.bool,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

const defaultProps = {
  className: undefined,
  withTime: true,
  value: undefined,
};

const DatePicker = ({ className, withTime, value, onChange, ...inputProps }) => {
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const $containerRef = useRef();

  useOnOutsideClick($containerRef, isDropdownOpen, () => setDropdownOpen(false));

  const handleInputChange = useCallback((text) => {
    setInputText(text);
  }, []);

  const handleInputFocus = useCallback(() => {
    if (value) {
      setInputText(getFormattedInputValue(value, withTime));
    }
    setDropdownOpen(true);
  }, [value, withTime]);

  const handleInputBlur = useCallback(() => {
    if (inputText) {
      const parsed = parseDateTimeText(inputText);
      if (parsed) {
        onChange(formatForOutput(parsed, withTime));
      }
    }
    setInputText('');
  }, [inputText, onChange, withTime]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && inputText) {
      const parsed = parseDateTimeText(inputText);
      if (parsed) {
        onChange(formatForOutput(parsed, withTime));
      }
      setInputText('');
      setDropdownOpen(false);
      e.preventDefault();
    }
  }, [inputText, onChange, withTime]);

  const displayValue = inputText || (value ? getFormattedInputValue(value, withTime) : '');

  return (
    <StyledDatePicker ref={$containerRef}>
      <Input
        icon="calendar"
        {...inputProps}
        className={className}
        autoComplete="off"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
      />
      {isDropdownOpen && (
        <Dropdown withTime={withTime}>
          <DateSection
            withTime={withTime}
            value={value}
            onChange={onChange}
            setDropdownOpen={setDropdownOpen}
          />
          {withTime && (
            <TimeSection value={value} onChange={onChange} setDropdownOpen={setDropdownOpen} />
          )}
        </Dropdown>
      )}
    </StyledDatePicker>
  );
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function parseDateTimeText(text) {
  if (!text || typeof text !== 'string') return null;
  
  const lower = text.toLowerCase().trim();
  
  const monthMatch = lower.match(/(january|february|march|april|may|june|july|august|september|october|november|december)/);
  const dayMatch = lower.match(/\b(\d{1,2})\b/);
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  const timeMatch = lower.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  
  if (!monthMatch || !dayMatch) return null;
  
  const monthIndex = MONTHS.indexOf(monthMatch[1]);
  const day = parseInt(dayMatch[1], 10);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
  
  let hours = 0;
  let minutes = 0;
  
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
    const ampm = timeMatch[3]?.toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
  }
  
  if (monthIndex < 0 || day < 1 || day > 31) return null;
  
  const date = new Date(year, monthIndex, day, hours, minutes, 0, 0);
  if (isNaN(date.getTime())) return null;
  
  return date;
}

function formatForOutput(date, withTime) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  if (withTime) {
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  return `${year}-${month}-${day}`;
}

const getFormattedInputValue = (value, withTime) => {
  if (!value) return '';
  return withTime ? formatDateTime(value) : formatDate(value);
};

DatePicker.propTypes = propTypes;
DatePicker.defaultProps = defaultProps;

export default DatePicker;
