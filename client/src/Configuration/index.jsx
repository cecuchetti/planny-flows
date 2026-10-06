import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import useApi from 'shared/hooks/api';
import toast from 'shared/utils/toast';
import { Button, PageError, PageLoader } from 'shared/components';

import Field from './Field';
import { buildChangePayload, buildProbeFields } from './formState';
import {
  Actions,
  GroupHeading,
  GroupSection,
  Heading,
  Notice,
  Page,
  SaveHint,
  Subheading,
} from './Styles';

/**
 * Runtime configuration tab.
 *
 * The whole form is generated from the API's registry metadata. Adding a setting
 * to `planny_core/config/keys.py` makes it appear here; this file never needs to
 * learn about a particular key.
 *
 * Only reachable by an administrator: the backend does not even mount these routes
 * when no administrator is configured, so a non-admin gets a 404 rather than a
 * form that fails on submit.
 */
const Configuration = () => {
  const { t } = useTranslation();
  const [{ data, error, isLoading }, fetchSettings] = useApi.get('/settings');
  const [{ isUpdating }, updateSettings] = useApi.put('/settings');
  const [{ isUpdating: isTesting }, testConnection] = useApi.post('/settings/test-connection');

  /** Values the admin has typed but not saved yet, keyed by setting key. */
  const [draft, setDraft] = useState({});
  const [testResults, setTestResults] = useState({});
  const [lastRestartKeys, setLastRestartKeys] = useState([]);

  const entries = useMemo(
    () => (data ? data.groups.flatMap((group) => group.entries) : []),
    [data],
  );

  const byKey = useMemo(
    () => Object.fromEntries(entries.map((entry) => [entry.key, entry])),
    [entries],
  );

  const handleChange = useCallback((key, value) => {
    // A cleared input means "fall back to the stored value", not "set null".
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const handleTestConnection = useCallback(
    async (key, value) => {
      const entry = byKey[key];
      // Send the current effective values for the connection, overridden by
      // whatever the admin has typed, so testing one field does not require
      // retyping the rest — and a stored password is never rendered back.
      const fields = {};
      entries
        .filter((candidate) => candidate.group === 'Database')
        .forEach((candidate) => {
          const pending = draft[candidate.key];
          const effective = candidate.value;
          const chosen = pending !== undefined ? pending : effective;
          if (chosen !== undefined && chosen !== null && chosen !== '') {
            fields[candidate.key] = chosen;
          }
        });
      fields[key] = value;

      try {
        const result = await testConnection({ target: 'database', fields });
        setTestResults((current) => ({ ...current, [key]: result }));
      } catch (apiError) {
        setTestResults((current) => ({
          ...current,
          [key]: { ok: false, detail: apiError.message },
        }));
      }
    },
    [byKey, draft, entries, testConnection],
  );

  const handleSave = async () => {
    // A secret renders as an empty box because the API never sends it back.
    // `buildChangePayload` omits an untouched secret rather than submitting the
    // blank that would erase the stored credential.
    const { changes } = buildChangePayload(byKey, draft);

    if (changes.length === 0) {
      // Nothing typed: stay quiet rather than reporting a success for a no-op.
      return;
    }

    try {
      const response = await updateSettings({ changes });
      const rejected = response.results.filter((result) => result.status === 'rejected');

      rejected.forEach((result) => toast.error(`${result.key}: ${result.detail}`));
      setLastRestartKeys(response.restartKeys || []);

      if (rejected.length === 0) {
        toast.success(t('configuration.saved'));
      }

      setDraft({});
      fetchSettings();
    } catch (apiError) {
      toast.error(apiError.message);
    }
  };

  if (isLoading) return <PageLoader />;
  if (error) return <PageError />;

  // Derived from the same builder that produces the request, so the badge can
  // never disagree with what a save would actually send.
  const pendingCount = buildChangePayload(byKey, draft).changes.length;

  return (
    <Page>
      <Heading>{t('configuration.title')}</Heading>
      <Subheading>{t('configuration.subtitle')}</Subheading>

      {!data.masterKeyConfigured && (
        <Notice tone="warn">{t('configuration.masterKeyMissing')}</Notice>
      )}

      {lastRestartKeys.length > 0 && (
        <Notice tone="warn">
          {t('configuration.restartPending', { keys: lastRestartKeys.join(', ') })}
        </Notice>
      )}

      {data.groups.map((group) => (
        <GroupSection key={group.name}>
          <GroupHeading>{group.name}</GroupHeading>
          {group.entries.map((entry) => (
            <Field
              key={entry.key}
              entry={entry}
              value={draft[entry.key]}
              onChange={handleChange}
              testResult={testResults[entry.key]}
              onTestConnection={entry.group === 'Database' ? handleTestConnection : undefined}
              isTesting={isTesting}
            />
          ))}
        </GroupSection>
      ))}

      <Actions>
        <Button variant="primary" isWorking={isUpdating} onClick={handleSave}>
          {t('common.saveChanges')}
        </Button>
        {pendingCount > 0 && (
          <SaveHint>{t('configuration.pendingCount', { count: pendingCount })}</SaveHint>
        )}
      </Actions>
    </Page>
  );
};

export default Configuration;
