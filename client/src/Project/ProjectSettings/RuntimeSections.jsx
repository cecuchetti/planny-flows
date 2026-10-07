import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import useApi from 'shared/hooks/api';
import toast from 'shared/utils/toast';
import { Accordion, Button, PageError, PageLoader } from 'shared/components';

import RuntimeField from './RuntimeField';
import { buildChangePayload, buildProbeFields } from './runtimeForm';
import { Actions, Notice, SaveHint } from './Styles';

/**
 * Runtime configuration, one accordion per registry group.
 *
 * The whole form is generated from the API's metadata: adding a key to
 * `planny_core/config/keys.py` makes it appear here, in its group, with no change
 * to this file.
 *
 * Each section saves on its own. A single page-wide save would send every
 * section's edits at once, so an operator changing one Jira URL would also be
 * committing whatever half-typed value sat in another section.
 */
function RuntimeSections() {
  const { t } = useTranslation();
  const [{ data, error, isLoading }, fetchSettings] = useApi.get('/settings');
  const [{ isUpdating }, updateSettings] = useApi.put('/settings');
  const [{ isUpdating: isTesting }, testConnection] = useApi.post('/settings/test-connection');

  /** Values typed but not saved, keyed by setting key. */
  const [draft, setDraft] = useState({});
  const [testResults, setTestResults] = useState({});
  const [restartKeys, setRestartKeys] = useState([]);
  const [savingGroup, setSavingGroup] = useState(null);

  const entries = useMemo(
    () => (data ? data.groups.flatMap((group) => group.entries) : []),
    [data],
  );

  const byKey = useMemo(
    () => Object.fromEntries(entries.map((entry) => [entry.key, entry])),
    [entries],
  );

  const handleChange = useCallback((key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const handleTestConnection = useCallback(
    async (key, value) => {
      const fields = buildProbeFields(entries, draft, key, value);
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
    [draft, entries, testConnection],
  );

  const handleSave = async (groupName) => {
    // An untouched secret is omitted rather than submitted as blank; see
    // `buildChangePayload`.
    const { changes } = buildChangePayload(byKey, draft, groupName);
    if (changes.length === 0) return;

    setSavingGroup(groupName);
    try {
      const response = await updateSettings({ changes });
      const rejected = response.results.filter((result) => result.status === 'rejected');

      rejected.forEach((result) => toast.error(`${result.key}: ${result.detail}`));
      setRestartKeys((current) => [...new Set([...current, ...(response.restartKeys || [])])]);

      if (rejected.length === 0) {
        toast.success(t('configuration.saved'));
      }

      // Only this section's drafts are dropped, so edits in another section are
      // not discarded by saving a different one.
      setDraft((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => byKey[key]?.group !== groupName),
        ),
      );
      fetchSettings();
    } catch (apiError) {
      toast.error(apiError.message);
    } finally {
      setSavingGroup(null);
    }
  };

  if (isLoading) return <PageLoader />;
  if (error) return <PageError />;

  return (
    <React.Fragment>
      {!data.masterKeyConfigured && (
        <Notice tone="warn">{t('configuration.masterKeyMissing')}</Notice>
      )}

      {data.groups.map((group) => {
        const pending = buildChangePayload(byKey, draft, group.name).changes.length;
        const groupRestart = restartKeys.filter((key) => byKey[key]?.group === group.name);

        return (
          <Accordion
            key={group.name}
            title={t(`configuration.group.${group.name}`, { defaultValue: group.name })}
            badge={pending > 0 ? t('configuration.pendingCount', { count: pending }) : undefined}
            badgeTone="warn"
          >
            {groupRestart.length > 0 && (
              <Notice tone="warn">
                {t('configuration.restartPending', { keys: groupRestart.join(', ') })}
              </Notice>
            )}

            {group.entries.map((entry) => (
              <RuntimeField
                key={entry.key}
                entry={entry}
                value={draft[entry.key]}
                onChange={handleChange}
                testResult={testResults[entry.key]}
                onTestConnection={entry.group === 'Database' ? handleTestConnection : undefined}
                isTesting={isTesting}
              />
            ))}

            <Actions>
              <Button
                variant="primary"
                isWorking={isUpdating && savingGroup === group.name}
                disabled={pending === 0}
                onClick={() => handleSave(group.name)}
              >
                {t('common.saveChanges')}
              </Button>
              {pending === 0 && <SaveHint>{t('configuration.noChanges')}</SaveHint>}
            </Actions>
          </Accordion>
        );
      })}
    </React.Fragment>
  );
}

export default RuntimeSections;
