/* eslint-disable react/require-default-props */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import Button from 'shared/components/Button';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import BorrowerPicker from '../BorrowerPicker';
import { loanFormCopy } from '../copy';
import { CURRENCIES, amountWithCurrency, pendingBalancePreview, toAmount } from '../money';
import { ErrorText, Field, Input, Muted, Panel, Row, Select } from '../Styles';

/** Today in the operator's own timezone, not UTC (`toISOString` can shift a day). */
const today = () => {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const emptyForm = () => ({
  amount: '',
  currency: 'USD',
  date: today(),
  concept: '',
  lender: '',
  city: 'Córdoba',
  advancePaid: '',
  installmentAmount: '',
});

const formFromLoan = (loan) => ({
  amount: loan.amount ?? '',
  currency: loan.currency || 'USD',
  date: (loan.date || '').slice(0, 10),
  concept: loan.concept ?? '',
  lender: loan.lender ?? '',
  city: loan.city ?? '',
  advancePaid: loan.advancePaid ?? '',
  installmentAmount: loan.installmentAmount ?? '',
});

function LoanForm({ loanId }) {
  const navigate = useNavigate();
  const [borrower, setBorrower] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setLoading] = useState(Boolean(loanId));
  const [loadError, setLoadError] = useState(null);
  const [isSaving, setSaving] = useState(false);

  const load = useCallback(
    () =>
      api.get(`/api/v1/loans/${loanId}`).then((data) => {
        if (!data.loan) return;
        setForm(formFromLoan(data.loan));
        setBorrower(data.loan.borrower || null);
      }),
    [loanId],
  );

  useEffect(() => {
    if (!loanId) {
      setBorrower(null);
      setForm(emptyForm());
      setLoading(false);
      setLoadError(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    load()
      .catch(() => {
        if (!cancelled) setLoadError(loanFormCopy.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loanId, load]);

  const change = (name) => (event) => setForm({ ...form, [name]: event.target.value });

  const balance = useMemo(
    () => pendingBalancePreview(form.amount, form.advancePaid),
    [form.amount, form.advancePaid],
  );

  // Currency is editable only while nothing has been paid in advance.
  const currencyLocked = toAmount(form.advancePaid) > 0;

  const retry = () => {
    setLoadError(null);
    setLoading(true);
    load()
      .catch(() => setLoadError(loanFormCopy.loadError))
      .finally(() => setLoading(false));
  };

  const save = (event) => {
    event.preventDefault();
    if (!borrower) {
      toast.error({ message: loanFormCopy.emptyPicker });
      return;
    }
    setSaving(true);
    const payload = { ...form, borrowerId: borrower.id };
    const request = loanId
      ? api.put(`/api/v1/loans/${loanId}`, payload)
      : api.post('/api/v1/loans', payload);
    request
      .then(() => {
        toast.success(loanId ? loanFormCopy.updated : loanFormCopy.created);
        navigate('/loans/loans');
      })
      .catch((error) => toast.error(error))
      .finally(() => setSaving(false));
  };

  if (isLoading) return <Panel>{loanFormCopy.loading}</Panel>;

  if (loadError) {
    return (
      <Panel>
        <div role="alert">
          <ErrorText>{loadError}</ErrorText>
          <Button onClick={retry}>{loanFormCopy.retry}</Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <h2>{loanId ? loanFormCopy.editTitle : loanFormCopy.createTitle}</h2>
      <form onSubmit={save}>
        <Field>
          <span>{loanFormCopy.picker}</span>
          <BorrowerPicker value={borrower} onChange={setBorrower} />
        </Field>
        <Row>
          <Field>
            <span>{loanFormCopy.amount}</span>
            <Input
              required
              type="number"
              step="0.01"
              min="0"
              name="amount"
              value={form.amount}
              onChange={change('amount')}
            />
          </Field>
          <Field>
            <span>{loanFormCopy.currency}</span>
            <Select
              name="currency"
              value={form.currency}
              disabled={currencyLocked}
              onChange={change('currency')}
            >
              {CURRENCIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <span>{loanFormCopy.date}</span>
            <Input required type="date" name="date" value={form.date} onChange={change('date')} />
          </Field>
        </Row>
        <Row>
          <Field>
            <span>{loanFormCopy.concept}</span>
            <Input required name="concept" value={form.concept} onChange={change('concept')} />
          </Field>
          <Field>
            <span>{loanFormCopy.lender}</span>
            <Input required name="lender" value={form.lender} onChange={change('lender')} />
          </Field>
          <Field>
            <span>{loanFormCopy.city}</span>
            <Input name="city" value={form.city} onChange={change('city')} />
          </Field>
        </Row>
        <Row>
          <Field>
            <span>{loanFormCopy.advancePaid}</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              name="advancePaid"
              value={form.advancePaid}
              onChange={change('advancePaid')}
            />
          </Field>
          <Field>
            <span>
              {loanFormCopy.installmentAmount} <Muted>({loanFormCopy.installmentOptional})</Muted>
            </span>
            <Input
              type="number"
              step="0.01"
              min="0"
              name="installmentAmount"
              value={form.installmentAmount}
              onChange={change('installmentAmount')}
            />
          </Field>
        </Row>
        <p>
          {loanFormCopy.balancePreview}:{' '}
          <strong>{balance === null ? '—' : amountWithCurrency(balance, form.currency)}</strong>
        </p>
        <Button variant="primary" isWorking={isSaving}>
          {loanId ? loanFormCopy.saveChanges : loanFormCopy.save}
        </Button>
      </form>
    </Panel>
  );
}
LoanForm.propTypes = { loanId: PropTypes.string };

export default LoanForm;
