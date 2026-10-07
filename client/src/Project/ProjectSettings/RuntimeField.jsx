/* eslint-disable react/require-default-props -- optional props are read, never required */
import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { Input, Select } from 'shared/components';

import { displayValue } from './runtimeForm';

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

/** Widget type for a key, from its declared type. */
function inputTypeFor(entry, isSecret) {
  if (isSecret) return 'password';
  if (entry.type === 'integer') return 'number';
  return 'text';
}

/** Placeholder for a secret, which never carries a value back from the API. */
function secretPlaceholder(t, isConfigured) {
  return isConfigured ? t('configuration.secretStored') : t('configuration.secretNotSet');
}

/**
 * One setting, rendered from the registry metadata.
 *
 * The control is chosen by `type` and the badges by `apply`, `isSecret` and
 * `source`, all of which the API reports. Nothing here decides what a key
 * *means*, so a new setting appears in this tab as soon as it is added to the
 * registry, with no change to this file.
 */
function Field({ entry, value, onChange, testResult, onTestConnection, isTesting }) {
  const { t } = useTranslation();

  const { isSecret } = entry;
  // Only the database connection can be probed; the API refuses other targets.
  const canTest = entry.group === 'Database' && Boolean(onTestConnection);

  /**
   * Where the value comes from, so "I configured this" is distinguishable from
   * "this is what the code defaults to". A secret is reported the same way: the
   * page can say a token is in place without the token being sent to the client.
   */
  const sourceBadge = {
    database: { label: t('configuration.sourceDatabase'), tone: 'ok' },
    environment: { label: t('configuration.sourceEnvironment'), tone: 'info' },
    default: { label: t('configuration.sourceDefault'), tone: null },
    unset: { label: t('configuration.sourceUnset'), tone: 'warn' },
  }[entry.source];

  // `Input` and `Select` both hand back the value, not the DOM event.
  const handleChange = (newValue) => onChange(entry.key, newValue);

  /**
   * The input starts from the value in effect, so a configured setting is not
   * rendered as an empty box. A secret has no value to show — the API never sends
   * it — so the placeholder carries that information instead.
   */
  const displayed = displayValue(entry, value);
  const placeholder = isSecret ? secretPlaceholder(t, entry.isConfigured) : '';

  return (
    <FieldRow data-testid={`setting-${entry.key}`}>
      <FieldMeta>
        <FieldLabel htmlFor={`setting-input-${entry.key}`}>{entry.label}</FieldLabel>
        <FieldKey>{entry.key}</FieldKey>
        {entry.help && <FieldHelp>{entry.help}</FieldHelp>}
        <BadgeRow>
          {sourceBadge && <Badge tone={sourceBadge.tone}>{sourceBadge.label}</Badge>}
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
            type={inputTypeFor(entry, isSecret)}
            placeholder={placeholder}
            autoComplete={isSecret ? 'new-password' : 'off'}
          />
        )}

        {/*
          A restart key is saved but not in effect. Showing the pending value is
          the difference between "my change was ignored" and "my change is
          waiting for a restart".
        */}
        {entry.storedValue !== null && entry.storedValue !== undefined && (
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
}

Field.propTypes = {
  entry: PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    group: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    apply: PropTypes.string.isRequired,
    isSecret: PropTypes.bool.isRequired,
    isOverridden: PropTypes.bool.isRequired,
    isConfigured: PropTypes.bool.isRequired,
    source: PropTypes.oneOf(['database', 'environment', 'default', 'unset']).isRequired,
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
