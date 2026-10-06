import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { Input, Select } from 'shared/components';

import {
  Badge,
  BadgeRow,
  FieldControl,
  FieldHelp,
  FieldKey,
  FieldLabel,
  FieldMeta,
  FieldRow,
  PendingValue,
  TestLink,
  TestResult,
} from './Styles';

/**
 * One setting, rendered from the registry metadata.
 *
 * The control is chosen by `type` and the badges by `apply`/`isSecret`, all of
 * which the API reports. Nothing here decides what a key *means*, so a new
 * setting appears in this tab as soon as it is added to the registry, with no
 * change to this file.
 */
const Field = ({ entry, value, onChange, testResult, onTestConnection, isTesting }) => {
  const { t } = useTranslation();

  const isSecret = entry.isSecret;
  // Only the database connection can be probed; the API refuses other targets.
  const canTest = entry.group === 'Database' && Boolean(onTestConnection);

  // `Input` and `Select` both hand back the value, not the DOM event.
  const handleChange = (newValue) => onChange(entry.key, newValue);

  /**
   * A secret is never sent back by the API, so an empty box means "unchanged".
   * The placeholder states what is currently stored so the value is not lost.
   */
  const displayed = value === undefined || value === null ? '' : value;
  const placeholder = isSecret
    ? entry.isOverridden
      ? t('configuration.secretStored')
      : t('configuration.secretNotSet')
    : '';

  return (
    <FieldRow data-testid={`setting-${entry.key}`}>
      <FieldMeta>
        <FieldLabel htmlFor={`setting-input-${entry.key}`}>{entry.label}</FieldLabel>
        <FieldKey>{entry.key}</FieldKey>
        {entry.help && <FieldHelp>{entry.help}</FieldHelp>}
        <BadgeRow>
          {entry.isOverridden && <Badge>{t('configuration.overridden')}</Badge>}
          {entry.apply === 'restart' && (
            <Badge tone="warn">{t('configuration.needsRestart')}</Badge>
          )}
          {isSecret && <Badge tone="warn">{t('configuration.secret')}</Badge>}
        </BadgeRow>
      </FieldMeta>

      <FieldControl>
        {entry.choices && entry.choices.length > 0 ? (
          <Select
            name={`setting-input-${entry.key}`}
            value={displayed}
            onChange={handleChange}
            options={entry.choices.map((choice) => ({ value: choice, label: choice }))}
            withClearValue={false}
          />
        ) : (
          <Input
            id={`setting-input-${entry.key}`}
            value={displayed}
            onChange={handleChange}
            type={isSecret ? 'password' : entry.type === 'integer' ? 'number' : 'text'}
            placeholder={placeholder}
            autoComplete={isSecret ? 'new-password' : 'off'}
          />
        )}

        {/*
          A restart key is saved but not in effect. Showing the pending value is
          the difference between "my change was ignored" and "my change is
          waiting for a restart".
        */}
        {entry.isOverridden && entry.storedValue !== null && entry.storedValue !== undefined && (
          <PendingValue>
            {t('configuration.pendingValue', { value: String(entry.storedValue) })}
          </PendingValue>
        )}

        {canTest && (
          <TestLink
            type="button"
            disabled={isTesting}
            onClick={() => onTestConnection(entry.key, value)}
          >
            {isTesting ? t('configuration.testing') : t('configuration.testConnection')}
          </TestLink>
        )}

        {testResult && (
          <TestResult ok={testResult.ok}>
            {testResult.ok
              ? t('configuration.testOk', { latency: testResult.latencyMs })
              : testResult.detail}
          </TestResult>
        )}
      </FieldControl>
    </FieldRow>
  );
};

Field.propTypes = {
  entry: PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    group: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    apply: PropTypes.string.isRequired,
    isSecret: PropTypes.bool.isRequired,
    isOverridden: PropTypes.bool.isRequired,
    value: PropTypes.any,
    storedValue: PropTypes.any,
    defaultValue: PropTypes.any,
    choices: PropTypes.arrayOf(PropTypes.string),
    help: PropTypes.string,
  }).isRequired,
  value: PropTypes.any,
  onChange: PropTypes.func.isRequired,
  testResult: PropTypes.object,
  onTestConnection: PropTypes.func,
  isTesting: PropTypes.bool,
};

export default Field;
