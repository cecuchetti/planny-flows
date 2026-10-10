/* eslint-disable react/require-default-props */
import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import Button from 'shared/components/Button';
import ConfirmModal from 'shared/components/ConfirmModal';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import BorrowerPicker from '../BorrowerPicker';
import { loanFormCopy, paymentsCopy } from '../copy';
import {
  CURRENCIES,
  amountWithCurrency,
  collectedFromLoan,
  formatDate,
  paymentsTotal,
  pendingBalancePreview,
  toAmount,
} from '../money';
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

  // Everything already collected on this loan, recovered from the API's own
  // figures. It is deliberately not summed from the history: the history has its
  // own load state, and a failed one must not make the balance look wrong.
  const [collected, setCollected] = useState(0);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(Boolean(loanId));
  const [paymentsError, setPaymentsError] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isPaying, setPaying] = useState(false);

  const loadLoan = useCallback(() => {
    if (!loanId) return Promise.resolve();
    return api.get(`/api/v1/loans/${loanId}`).then((data) => {
      if (!data.loan) return;
      setForm(formFromLoan(data.loan));
      setBorrower(data.loan.borrower || null);
      setCollected(collectedFromLoan(data.loan));
    });
  }, [loanId]);

  const loadPayments = useCallback(() => {
    if (!loanId) return Promise.resolve();
    return api.get(`/api/v1/loans/${loanId}/payments`).then((data) => {
      setPayments(data.payments || []);
    });
  }, [loanId]);

  useEffect(() => {
    if (!loanId) {
      setBorrower(null);
      setForm(emptyForm());
      setCollected(0);
      setPayments([]);
      setPaymentAmount('');
      setLoading(false);
      setLoadError(null);
      setPaymentsLoading(false);
      setPaymentsError(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPaymentsLoading(true);
    setPaymentsError(null);
    loadLoan()
      .catch(() => {
        if (!cancelled) setLoadError(loanFormCopy.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // The history is its own request with its own failure: a broken payments
    // call must not take the loan form down with it.
    loadPayments()
      .catch(() => {
        if (!cancelled) setPaymentsError(paymentsCopy.loadError);
      })
      .finally(() => {
        if (!cancelled) setPaymentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loanId, loadLoan, loadPayments]);

  /**
   * Refresh the derived figures only, so unsaved edits survive a mutation.
   *
   * The two requests are handled separately: a history that fails to reload
   * after a successful write owns its own error and retry, rather than
   * surfacing as a failure of the write that just succeeded.
   */
  const refresh = useCallback(
    () =>
      Promise.all([
        api
          .get(`/api/v1/loans/${loanId}`)
          .then((data) => {
            if (!data.loan) return;
            // The form itself is deliberately left alone: a payment must not
            // discard an amount the operator has typed but not saved.
            setCollected(collectedFromLoan(data.loan));
          })
          .catch(() => {
            // The write succeeded; only the reload failed. Report it as a load
            // failure rather than as a failed payment.
            setPaymentsError(paymentsCopy.loadError);
          }),
        loadPayments().catch(() => {
          setPaymentsError(paymentsCopy.loadError);
        }),
      ]).catch((error) => {
        toast.error(error);
      }),
    [loanId, loadPayments],
  );

  const change = (name) => (event) => setForm({ ...form, [name]: event.target.value });

  const balance = useMemo(() => {
    if (!loanId) return pendingBalancePreview(form.amount, form.advancePaid);
    // The payments term is applied exactly once: ``collected`` is the server's
    // own figure, so it already covers every payment the history lists.
    return pendingBalancePreview(form.amount, form.advancePaid, collected);
  }, [loanId, form.amount, form.advancePaid, collected]);

  // Currency is editable only while nothing has been paid: an advance or a
  // registered payment would leave money of one currency inside another loan.
  const currencyLocked = toAmount(form.advancePaid) > 0 || payments.length > 0;

  const retry = () => {
    setLoadError(null);
    setLoading(true);
    loadLoan()
      .catch(() => setLoadError(loanFormCopy.loadError))
      .finally(() => setLoading(false));
    setPaymentsLoading(true);
    setPaymentsError(null);
    loadPayments()
      .catch(() => setPaymentsError(paymentsCopy.loadError))
      .finally(() => setPaymentsLoading(false));
  };

  const retryPayments = () => {
    setPaymentsError(null);
    setPaymentsLoading(true);
    loadPayments()
      .catch(() => setPaymentsError(paymentsCopy.loadError))
      .finally(() => setPaymentsLoading(false));
  };

  const registerPayment = (event) => {
    event.preventDefault();
    setPaying(true);
    api
      .post(`/api/v1/loans/${loanId}/payments`, { amount: paymentAmount })
      .then(() => {
        toast.success(paymentsCopy.registered);
        setPaymentAmount('');
        return refresh();
      })
      .catch((error) => toast.error(error))
      .finally(() => setPaying(false));
  };

  const removePayment = (paymentId) =>
    api
      .delete(`/api/v1/loans/${loanId}/payments/${paymentId}`)
      .then(() => {
        toast.success(paymentsCopy.removed);
        return refresh();
      })
      .catch((error) => toast.error(error));

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

  let paymentsContent;
  if (paymentsLoading) {
    paymentsContent = <Muted>{paymentsCopy.loading}</Muted>;
  } else if (paymentsError) {
    paymentsContent = (
      <div role="alert">
        <ErrorText>{paymentsError}</ErrorText>
        <Button onClick={retryPayments}>{paymentsCopy.retry}</Button>
      </div>
    );
  } else if (payments.length === 0) {
    paymentsContent = <Muted>{paymentsCopy.empty}</Muted>;
  } else {
    const paid = paymentsTotal(payments);
    paymentsContent = (
      <Fragment>
        <p>
          {paymentsCopy.total}: <strong>{amountWithCurrency(paid, form.currency)}</strong>
        </p>
        <h3>{paymentsCopy.history}</h3>
        {payments.map((payment) => (
          <Row key={payment.id}>
            <Muted>{formatDate(payment.date)}</Muted>
            <span>{amountWithCurrency(payment.amount, form.currency)}</span>
            <ConfirmModal
              variant="danger"
              title={paymentsCopy.removeTitle}
              message={paymentsCopy.removeMessage}
              confirmText={paymentsCopy.remove}
              renderLink={({ open }) => <Button onClick={open}>{paymentsCopy.remove}</Button>}
              onConfirm={({ close }) => removePayment(payment.id).finally(close)}
            />
          </Row>
        ))}
      </Fragment>
    );
  }

  const paymentSection = (
    <Panel>
      <h2>{paymentsCopy.title}</h2>
      <form onSubmit={registerPayment}>
        <Row>
          <Field>
            <span>{paymentsCopy.amount}</span>
            <Input
              required
              type="number"
              step="0.01"
              min="0"
              name="paymentAmount"
              placeholder={paymentsCopy.amountPlaceholder}
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
            />
          </Field>
          <Button variant="primary" isWorking={isPaying}>
            {isPaying ? paymentsCopy.registering : paymentsCopy.register}
          </Button>
        </Row>
      </form>
      {paymentsContent}
    </Panel>
  );

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
    <Fragment>
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
            <Fragment>
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
              {currencyLocked && <Muted role="note">{paymentsCopy.currencyLocked}</Muted>}
            </Fragment>
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
      {loanId && paymentSection}
    </Fragment>
  );
}
LoanForm.propTypes = { loanId: PropTypes.string };

export default LoanForm;
