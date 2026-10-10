import React, { Fragment, useCallback, useEffect, useState } from 'react';

import Button from 'shared/components/Button';
import ConfirmModal from 'shared/components/ConfirmModal';
import Form from 'shared/components/Form';
import InputDebounced from 'shared/components/InputDebounced';
import PageLoader from 'shared/components/PageLoader';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';

import { borrowerCopy } from '../copy';
import {
  CardGrid,
  CardTitle,
  Chip,
  EmptyState,
  ErrorText,
  ListCard,
  MetaLabel,
  MetaRow,
  Row,
  Section,
} from '../Styles';

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  nationalId: '',
  notes: '',
};

const PROFILE_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'address', 'nationalId'];

const validateBorrower = (values) => {
  const errors = {};
  ['firstName', 'lastName'].forEach((name) => {
    if (String(values[name] || '').trim() === '') errors[name] = borrowerCopy.required;
  });
  return errors;
};

function Borrowers() {
  const [search, setSearch] = useState('');
  const [borrowers, setBorrowers] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return api
      .get('/api/v1/borrowers', { search })
      .then((data) => setBorrowers(data.borrowers || []))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    setLoadError(null);
    load().catch(() => setLoadError(borrowerCopy.loadError));
  }, [load]);

  const save = (values) => {
    /*
     * Only the fields the endpoint accepts. Edit mode seeds the form from the
     * API's own borrower, which carries `loanCount` (a response field), and
     * posting the whole Formik bag would send it back on the wire.
     */
    const payload = PROFILE_FIELDS.concat('notes').reduce(
      (body, name) => ({ ...body, [name]: values[name] ?? '' }),
      {},
    );
    const request = editing
      ? api.put(`/api/v1/borrowers/${editing}`, payload)
      : api.post('/api/v1/borrowers', payload);
    return request
      .then(() => {
        toast.success(editing ? borrowerCopy.updated : borrowerCopy.created);
        setEditing(null);
        return load();
      })
      .catch((error) => {
        toast.error(error);
        // Rethrown so the form's own submit state settles, rather than resolving
        // on a write that failed.
        throw error;
      });
  };

  const remove = (id) =>
    api
      .delete(`/api/v1/borrowers/${id}`)
      .then(() => {
        toast.success(borrowerCopy.removed);
        if (editing === id) setEditing(null);
        return load();
      })
      .catch((error) => toast.error(error));

  const retry = () => {
    setLoadError(null);
    load().catch(() => setLoadError(borrowerCopy.loadError));
  };

  let directoryContent;
  if (loadError) {
    directoryContent = (
      <div role="alert">
        <ErrorText>{loadError}</ErrorText>
        <Button type="button" onClick={retry}>
          {borrowerCopy.retry}
        </Button>
      </div>
    );
  } else if (isLoading) {
    directoryContent = <PageLoader />;
  } else if (borrowers.length === 0) {
    directoryContent = (
      <EmptyState>{search ? borrowerCopy.noMatches : borrowerCopy.empty}</EmptyState>
    );
  } else {
    directoryContent = (
      <CardGrid>
        {borrowers.map((borrower) => (
          <ListCard key={borrower.id}>
            <MetaRow>
              <strong>
                {borrower.firstName} {borrower.lastName}
              </strong>
              <Chip>
                {borrowerCopy.loanCount}: {borrower.loanCount || 0}
              </Chip>
            </MetaRow>

            {(borrower.email || borrower.phone) && (
              <MetaRow>
                {borrower.email && (
                  <span>
                    <MetaLabel>{borrowerCopy.email}: </MetaLabel>
                    {borrower.email}
                  </span>
                )}
                {borrower.phone && (
                  <span>
                    <MetaLabel>{borrowerCopy.phone}: </MetaLabel>
                    {borrower.phone}
                  </span>
                )}
              </MetaRow>
            )}

            <Row>
              <Button type="button" onClick={() => setEditing(borrower.id)}>
                {borrowerCopy.edit}
              </Button>
              <ConfirmModal
                variant="danger"
                title={borrowerCopy.removeTitle}
                message={borrowerCopy.removeMessage}
                confirmText={borrowerCopy.remove}
                renderLink={({ open }) => (
                  <Button type="button" onClick={open}>
                    {borrowerCopy.remove}
                  </Button>
                )}
                onConfirm={({ close }) => remove(borrower.id).finally(close)}
              />
            </Row>
          </ListCard>
        ))}
      </CardGrid>
    );
  }

  const editingBorrower = borrowers.find((item) => item.id === editing);

  return (
    <Section>
      <CardTitle>{borrowerCopy.title}</CardTitle>

      <InputDebounced
        value={search}
        onChange={setSearch}
        placeholder={borrowerCopy.search}
        aria-label={borrowerCopy.search}
      />

      {/*
       * `editing` switches the section between "add" and "edit"; the key remounts
       * the form so it starts from the person being edited instead of the one it
       * was showing before.
       */}
      <Form
        key={editing || 'new'}
        initialValues={editingBorrower ? { ...EMPTY, ...editingBorrower } : EMPTY}
        validate={validateBorrower}
        validateOnChange={false}
        onSubmit={save}
      >
        {/* One child: Formik renders its child element directly. */}
        <Fragment>
          <Row>
            {PROFILE_FIELDS.map((name) => (
              <Form.Field.Input key={name} name={name} label={borrowerCopy[name]} />
            ))}
          </Row>
          <Form.Field.Textarea name="notes" label={borrowerCopy.notes} />
          <Row>
            <Button type="submit" variant="primary">
              {editing ? borrowerCopy.edit : borrowerCopy.add}
            </Button>
            {editing && (
              <Button type="button" onClick={() => setEditing(null)}>
                {borrowerCopy.cancel}
              </Button>
            )}
          </Row>
        </Fragment>
      </Form>

      {directoryContent}
    </Section>
  );
}

export default Borrowers;
