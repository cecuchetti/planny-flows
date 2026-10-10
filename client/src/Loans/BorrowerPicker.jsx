import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import debounce from 'lodash/debounce';

import Button from 'shared/components/Button';
import Input from 'shared/components/Input';
import Select from 'shared/components/Select';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';

import { borrowerCopy } from './copy';
import { ErrorText, Muted, PickerHint, Row } from './Styles';

/* eslint-disable react/require-default-props */

const nameOf = (borrower) => `${borrower.firstName} ${borrower.lastName}`.trim();

/**
 * Choosing the person on a loan.
 *
 * The search is a request of its own, so this stays outside Formik's `values`:
 * `value`/`onChange` hand the chosen person back to the form. The control is the
 * shared `Select` — the same one the settings page uses — so the search box, the
 * option list and the placeholder come from the design system instead of from a
 * row of raw buttons.
 *
 * The dropdown's search box is reported through `onSearch` (a keystroke) and a
 * choice through `onChange` (an option's value). The request is the module's own
 * and debounced here, so no shared component learns about borrowers.
 *
 * The person can also be created here, because the alternative is losing what you
 * just typed in order to go to Personas and start over.
 */
function BorrowerPicker({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [borrowers, setBorrowers] = useState([]);
  const [isLoading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [isCreating, setCreating] = useState(false);
  const [newPerson, setNewPerson] = useState({ firstName: '', lastName: '' });
  const [isSaving, setSaving] = useState(false);
  /*
   * `Select` keeps the choice it was given in its own state. Clearing the
   * selection here has to clear it there too, so the picker is remounted under a
   * new key whenever the person changes — otherwise the just-cleared select went
   * on showing the person that was cleared.
   */
  const [pickerEpoch, setPickerEpoch] = useState(0);
  /*
   * A failed search is retried with the same query, so the query cannot be the
   * thing that triggers the refetch: setting it to its own value makes React
   * bail out and the effect never re-runs. This counter is the retry, and the
   * effect depends on it as well.
   */
  const [reloadToken, setReloadToken] = useState(0);

  // The option list can change under the handler (a search in flight, a create);
  // the ref keeps the lookup reading the newest one.
  const borrowersRef = useRef(borrowers);
  borrowersRef.current = borrowers;

  // Once a person is selected the picker shows the selection instead of the
  // search results, so edit mode can preselect and still be changed.
  const selected = value || null;

  const search = useRef(debounce((text) => setQuery(text), 400)).current;

  // The debounce outlives a render, so it is cancelled with the picker: a
  // pending keystroke must not set state on a form that is gone.
  useEffect(() => () => search.cancel(), [search]);

  useEffect(() => {
    if (selected) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api
      .get('/api/v1/borrowers', { search: query })
      .then((data) => {
        if (!cancelled) setBorrowers(data.borrowers || []);
      })
      .catch(() => {
        if (!cancelled) setLoadError(borrowerCopy.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, selected, reloadToken]);

  const options = borrowers.map((borrower) => ({
    value: borrower.id,
    label: nameOf(borrower),
  }));

  /**
   * A choice resolves the option's value back to the person.
   *
   * `Select` hands back the option's *value*, which is the id here; a loan needs
   * the object. The list the options were built from is the only place that
   * mapping exists, so it is read through the ref rather than rebuilt.
   */
  const handleSelect = (borrowerId) => {
    const borrower = borrowersRef.current.find((item) => item.id === borrowerId);
    if (borrower) onChange(borrower);
  };

  const createBorrower = () => {
    const firstName = newPerson.firstName.trim();
    const lastName = newPerson.lastName.trim();
    if (!firstName || !lastName) {
      toast.error({ message: borrowerCopy.required });
      return;
    }
    // Reuse an existing match instead of silently creating a second person with
    // the same name, which is what the old raw-button flow did.
    const existing = borrowersRef.current.find(
      (item) => item.firstName === firstName && item.lastName === lastName,
    );
    if (existing) {
      onChange(existing);
      return;
    }
    setSaving(true);
    api
      .post('/api/v1/borrowers', { ...newPerson, firstName, lastName })
      .then((data) => {
        if (data.borrower) onChange(data.borrower);
      })
      .catch((error) => toast.error(error))
      .finally(() => setSaving(false));
  };

  if (selected) {
    return (
      <Row>
        <span>Persona seleccionada: {nameOf(selected)}</span>
        <Button
          type="button"
          onClick={() => {
            setQuery('');
            setCreating(false);
            setPickerEpoch((current) => current + 1);
            onChange(null);
          }}
        >
          Cambiar persona
        </Button>
      </Row>
    );
  }

  return (
    <div>
      <Select
        key={pickerEpoch}
        name="borrower"
        onChange={handleSelect}
        onSearch={search}
        options={options}
        placeholder={borrowerCopy.pickerSearch}
        withClearValue={false}
      />

      {/*
       * Everything below the select is pushed clear of the open dropdown, which
       * is absolutely positioned over this area.
       */}
      <PickerHint>
        {isLoading && <Muted>{borrowerCopy.loading}</Muted>}

        {loadError && (
          <div role="alert">
            <ErrorText>{loadError}</ErrorText>
            {/* Same query, run again: the retry must not change what is searched. */}
            <Button type="button" onClick={() => setReloadToken((current) => current + 1)}>
              {borrowerCopy.retry}
            </Button>
          </div>
        )}

        {!loadError && !isLoading && query && borrowers.length === 0 && (
          <div>
            <Muted>{borrowerCopy.noMatches}</Muted>
            {!isCreating ? (
              <Row>
                <Button type="button" onClick={() => setCreating(true)}>
                  {borrowerCopy.create}
                </Button>
              </Row>
            ) : (
              <Row>
                <Input
                  required
                  placeholder={borrowerCopy.firstName}
                  value={newPerson.firstName}
                  onChange={(firstName) => setNewPerson((current) => ({ ...current, firstName }))}
                  aria-label={borrowerCopy.firstName}
                />
                <Input
                  required
                  placeholder={borrowerCopy.lastName}
                  value={newPerson.lastName}
                  onChange={(lastName) => setNewPerson((current) => ({ ...current, lastName }))}
                  aria-label={borrowerCopy.lastName}
                />
                <Button
                  type="button"
                  variant="primary"
                  isWorking={isSaving}
                  onClick={createBorrower}
                >
                  {borrowerCopy.save}
                </Button>
              </Row>
            )}
          </div>
        )}

        {!loadError && !isLoading && !query && borrowers.length === 0 && (
          <Muted>{borrowerCopy.empty}</Muted>
        )}
      </PickerHint>
    </div>
  );
}

BorrowerPicker.propTypes = {
  value: PropTypes.shape({
    id: PropTypes.number,
    firstName: PropTypes.string,
    lastName: PropTypes.string,
  }),
  onChange: PropTypes.func.isRequired,
};

export default BorrowerPicker;
