/* eslint-disable react/require-default-props */
import React, { Fragment, useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useParams } from 'react-router-dom';
import { useFormikContext } from 'formik';

import Button from 'shared/components/Button';
import ConfirmModal from 'shared/components/ConfirmModal';
import Form from 'shared/components/Form';
import Input from 'shared/components/Input';
import PageLoader from 'shared/components/PageLoader';
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
import {
  CardTitle,
  Chip,
  EmptyState,
  ErrorText,
  FieldErrorText,
  FieldLabelText,
  FieldShell,
  List,
  ListRow,
  MetaLabel,
  Muted,
  Row,
  Section,
} from '../Styles';

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

/*
 * The rules stay here so the messages are the module's own Spanish copy; the
 * focus, the border and the error slot come from `Form.Field`.
 *
 * A cleared number field hands back `''` — "nothing typed", not an invalid
 * amount — so only the fields the API requires are checked, and each one is
 * checked against exactly that empty case.
 */
const validateRequired = (values, names) =>
  names.reduce((errors, name) => {
    const value = values[name];
    const isEmpty = value === undefined || value === null || String(value).trim() === '';
    return isEmpty ? { ...errors, [name]: loanFormCopy.required } : errors;
  }, {});

const validateLoan = (values) => validateRequired(values, ['amount', 'date', 'concept', 'lender']);

/**
 * The currency, locked while anything was paid.
 *
 * `advancePaid` is a sibling in the same form, so the lock is read from Formik
 * rather than from a parallel copy of the values. It renders the shared
 * `Select` in its disabled state, with the reason underneath — not a second
 * control next to it.
 */
function CurrencyField({ isLocked, isClosed }) {
  // A closed loan is locked for its own reason (the notice beside the form);
  // otherwise the currency-lock explanation is the payments/advance reason.
  const tip = isClosed || !isLocked ? undefined : paymentsCopy.currencyLocked;
  return (
    <Form.Field.Select
      name="currency"
      label={loanFormCopy.currency}
      options={CURRENCIES.map((item) => ({ value: item, label: item }))}
      disabled={isLocked || isClosed}
      withClearValue={false}
      tip={tip}
    />
  );
}

CurrencyField.propTypes = {
  isLocked: PropTypes.bool.isRequired,
  isClosed: PropTypes.bool.isRequired,
};

/**
 * The payment capture, outside the loan's Formik form.
 *
 * A payment is a separate write with a separate submit, so it keeps its own
 * local state and its own action. Binding it to a Formik field would have made
 * typing an amount write a `paymentAmount` into the loan payload, and nesting a
 * second `<form>` inside the loan form is invalid HTML.
 */
function PaymentAmountField({ value, onChange }) {
  return (
    <FieldShell data-testid="form-field:paymentAmount">
      <FieldLabelText htmlFor="loan-payment-amount">{paymentsCopy.amount}</FieldLabelText>
      <Input
        id="loan-payment-amount"
        name="paymentAmount"
        type="number"
        step="0.01"
        min="0"
        placeholder={paymentsCopy.amountPlaceholder}
        value={value}
        onChange={onChange}
      />
    </FieldShell>
  );
}

PaymentAmountField.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

/**
 * One row of the payment history.
 *
 * A reversed payment keeps its row and is labelled in words — a struck-through
 * amount would say "gone", and the whole point is that it is still there to be
 * named. The row's action follows its own state: an in-force payment offers the
 * reversal, a reversed one offers to undo it.
 */
function PaymentRow({ payment, currency, onReverse, onUndoReversal }) {
  const isReversed = Boolean(payment.reversedAt);
  const title = isReversed ? paymentsCopy.undoTitle : paymentsCopy.reverseTitle;
  const message = isReversed ? paymentsCopy.undoMessage : paymentsCopy.reverseMessage;
  const confirmText = isReversed ? paymentsCopy.undoReversal : paymentsCopy.reverse;
  const action = isReversed ? onUndoReversal : onReverse;

  return (
    <ListRow>
      <Muted>{formatDate(payment.date)}</Muted>
      <span>{amountWithCurrency(payment.amount, currency)}</span>
      {isReversed && <Chip>{paymentsCopy.reversedTag}</Chip>}
      <ConfirmModal
        variant={isReversed ? 'primary' : 'danger'}
        title={title}
        message={message}
        confirmText={confirmText}
        renderLink={({ open }) => (
          <Button type="button" onClick={open}>
            {confirmText}
          </Button>
        )}
        onConfirm={({ close }) => action(payment.id).finally(close)}
      />
    </ListRow>
  );
}

PaymentRow.propTypes = {
  payment: PropTypes.shape({
    id: PropTypes.number.isRequired,
    date: PropTypes.string,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    reversedAt: PropTypes.string,
  }).isRequired,
  currency: PropTypes.string.isRequired,
  onReverse: PropTypes.func.isRequired,
  onUndoReversal: PropTypes.func.isRequired,
};

function LoanForm({ loanId = undefined }) {
  const navigate = useNavigate();
  const params = useParams();
  // The route supplies the id in edit mode; the prop stays for a direct render.
  const id = loanId ?? params.loanId ?? null;

  const [borrower, setBorrower] = useState(null);
  const [borrowerError, setBorrowerError] = useState(null);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [isLoading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState(null);
  const [isSaving, setSaving] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [writtenOffAmount, setWrittenOffAmount] = useState(null);

  // Everything already collected on this loan, recovered from the API's own
  // figures. It is deliberately not summed from the history: the history has its
  // own load state, and a failed one must not make the balance look wrong.
  const [collected, setCollected] = useState(0);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(Boolean(id));
  const [paymentsError, setPaymentsError] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isPaying, setPaying] = useState(false);

  const loadLoan = useCallback(() => {
    if (!id) return Promise.resolve();
    return api.get(`/api/v1/loans/${id}`).then((data) => {
      if (!data.loan) return;
      setInitialForm(formFromLoan(data.loan));
      setBorrower(data.loan.borrower || null);
      setCollected(collectedFromLoan(data.loan));
      setIsClosed(data.loan.status === 'closed');
      setWrittenOffAmount(
        data.loan.writtenOffAmount === null || data.loan.writtenOffAmount === undefined
          ? null
          : data.loan.writtenOffAmount,
      );
    });
  }, [id]);

  const loadPayments = useCallback(() => {
    if (!id) return Promise.resolve();
    return api.get(`/api/v1/loans/${id}/payments`).then((data) => {
      setPayments(data.payments || []);
    });
  }, [id]);

  useEffect(() => {
    if (!id) {
      setBorrower(null);
      setBorrowerError(null);
      setInitialForm(emptyForm());
      setCollected(0);
      setPayments([]);
      setPaymentAmount('');
      setLoading(false);
      setLoadError(null);
      setPaymentsLoading(false);
      setPaymentsError(null);
      setIsClosed(false);
      setWrittenOffAmount(null);
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
  }, [id, loadLoan, loadPayments]);

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
          .get(`/api/v1/loans/${id}`)
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
    [id, loadPayments],
  );

  const selectBorrower = (next) => {
    setBorrower(next);
    if (next) setBorrowerError(null);
  };

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

  const registerPayment = () => {
    setPaying(true);
    api
      .post(`/api/v1/loans/${id}/payments`, { amount: paymentAmount })
      .then(() => {
        toast.success(paymentsCopy.registered);
        setPaymentAmount('');
        return refresh();
      })
      .catch((error) => toast.error(error))
      .finally(() => setPaying(false));
  };

  /*
   * A payment is reversed, not deleted: `DELETE` on the payment itself marks it
   * and the balance recomputes through the server. The reversal is undoable, so
   * a misclick costs nothing.
   */
  const reversePayment = (paymentId) =>
    api
      .delete(`/api/v1/loans/${id}/payments/${paymentId}`)
      .then(() => {
        toast.success(paymentsCopy.reversed);
        return refresh();
      })
      .catch((error) => toast.error(error));

  const undoPaymentReversal = (paymentId) =>
    api
      .delete(`/api/v1/loans/${id}/payments/${paymentId}/reversal`)
      .then(() => {
        toast.success(paymentsCopy.restored);
        return refresh();
      })
      .catch((error) => toast.error(error));
  /*
   * The person is deliberately outside `values`: `Form.Field` binds a control,
   * and the picker is a search with its own request. The loan itself is then
   * the submitted values plus the chosen id.
   */
  const save = (values) => {
    if (!borrower) {
      setBorrowerError(loanFormCopy.emptyPicker);
      toast.error({ message: loanFormCopy.emptyPicker });
      return;
    }
    setSaving(true);
    const payload = { ...values, borrowerId: borrower.id };
    /*
     * A closed loan keeps only its descriptive fields editable: the amount, the
     * advance-paid and the currency are disabled in the form, and they must not
     * reach the payload either — sending them would trip the API's own guard and
     * turn a harmless concept edit into a 400.
     */
    if (isClosed) {
      delete payload.amount;
      delete payload.advancePaid;
      delete payload.currency;
    }
    const request = id
      ? api.put(`/api/v1/loans/${id}`, payload)
      : api.post('/api/v1/loans', payload);
    request
      .then(() => {
        toast.success(id ? loanFormCopy.updated : loanFormCopy.created);
        navigate('/project/loans');
      })
      .catch((error) => toast.error(error))
      .finally(() => setSaving(false));
  };

  let paymentsContent;
  if (paymentsLoading) {
    paymentsContent = <EmptyState>{paymentsCopy.loading}</EmptyState>;
  } else if (paymentsError) {
    paymentsContent = (
      <div role="alert">
        <ErrorText>{paymentsError}</ErrorText>
        {/* Not a submit: the register form above must not be fired by the retry. */}
        <Button type="button" onClick={retryPayments}>
          {paymentsCopy.retry}
        </Button>
      </div>
    );
  } else if (payments.length === 0) {
    paymentsContent = <EmptyState>{paymentsCopy.empty}</EmptyState>;
  } else {
    // Only what is still in force is collected: a reversed row stays visible but
    // does not count, exactly as the server leaves it out of `pendingBalance`.
    const paid = paymentsTotal(payments);
    paymentsContent = (
      <Fragment>
        <EmptyState>
          {paymentsCopy.total}: <strong>{amountWithCurrency(paid, initialForm.currency)}</strong>
        </EmptyState>
        <CardTitle as="h3">{paymentsCopy.history}</CardTitle>
        <List>
          {payments.map((payment) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              currency={initialForm.currency}
              onReverse={reversePayment}
              onUndoReversal={undoPaymentReversal}
            />
          ))}
        </List>
      </Fragment>
    );
  }

  const paymentSection = (
    <Section>
      <CardTitle>{paymentsCopy.title}</CardTitle>
      {/*
       * Nested form-shaped markup would be invalid HTML, so the payment capture
       * is a plain row: the button handles the write itself and the loan form
       * around it owns the only submit. A closed loan accepts no new payments
       * (FR18), so the capture is hidden and the history is read-only.
       */}
      {!isClosed && (
        <Row>
          <PaymentAmountField value={paymentAmount} onChange={setPaymentAmount} />
          <Button type="button" variant="primary" isWorking={isPaying} onClick={registerPayment}>
            {isPaying ? paymentsCopy.registering : paymentsCopy.register}
          </Button>
        </Row>
      )}
      {paymentsContent}
    </Section>
  );

  if (isLoading) return <PageLoader />;

  if (loadError) {
    return (
      <Section>
        <div role="alert">
          <ErrorText>{loadError}</ErrorText>
          <Button type="button" onClick={retry}>
            {loanFormCopy.retry}
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <Fragment>
      <Section>
        <CardTitle>{id ? loanFormCopy.editTitle : loanFormCopy.createTitle}</CardTitle>
        {id && (
          <Row>
            <span>
              <MetaLabel>{loanFormCopy.statusLabel}: </MetaLabel>
              {isClosed ? loanFormCopy.statusClosed : loanFormCopy.statusActive}
            </span>
            {isClosed && writtenOffAmount !== null && (
              <span>
                <MetaLabel>{loanFormCopy.writtenOffLabel}: </MetaLabel>
                {amountWithCurrency(writtenOffAmount, initialForm.currency)}
              </span>
            )}
          </Row>
        )}
        {isClosed && <Muted>{loanFormCopy.closedNotice}</Muted>}
        <Form
          initialValues={initialForm}
          validate={validateLoan}
          validateOnChange={false}
          onSubmit={save}
        >
          {/*
           * `Form.Element` is the actual <form>: `Form` only installs the
           * Formik context. Without it the fields render but nothing submits.
           */}
          <Form.Element data-testid="loan-form">
            {/* The picker is not a Formik value, so it gets the field chrome by hand. */}
            <FieldShell data-testid="form-field:borrower">
              <FieldLabelText htmlFor="loan-borrower-picker">{loanFormCopy.picker}</FieldLabelText>
              <div id="loan-borrower-picker">
                <BorrowerPicker value={borrower} onChange={selectBorrower} />
              </div>
              {borrowerError && <FieldErrorText role="alert">{borrowerError}</FieldErrorText>}
            </FieldShell>

            <Row>
              <Form.Field.Input
                name="amount"
                label={loanFormCopy.amount}
                type="number"
                step="0.01"
                min="0"
                disabled={isClosed}
              />
              <CurrencyFieldState hasPayments={payments.length > 0} isClosed={isClosed} />
              <Form.Field.DatePicker name="date" label={loanFormCopy.date} withTime={false} />
            </Row>

            <Row>
              <Form.Field.Input name="concept" label={loanFormCopy.concept} />
              <Form.Field.Input name="lender" label={loanFormCopy.lender} />
              <Form.Field.Input name="city" label={loanFormCopy.city} />
            </Row>

            <Row>
              <Form.Field.Input
                name="advancePaid"
                label={loanFormCopy.advancePaid}
                type="number"
                step="0.01"
                min="0"
                disabled={isClosed}
              />
              <Form.Field.Input
                name="installmentAmount"
                label={loanFormCopy.installmentAmount}
                tip={loanFormCopy.installmentOptional}
                type="number"
                step="0.01"
                min="0"
              />
            </Row>

            <LoanBalanceFooter isSaving={isSaving} isEdit={Boolean(id)} collected={collected} />
          </Form.Element>
        </Form>
      </Section>
      {id && paymentSection}
    </Fragment>
  );
}

/**
 * Reads the lock out of the form and hands it to the field.
 *
 * Phrased as a component because Formik's values are only reachable inside the
 * provider: `advancePaid` is a sibling field, and the lock has to follow it as
 * the operator types. The other half of the lock — registered payments — is
 * owned by the page and passed in.
 */
function CurrencyFieldState({ hasPayments, isClosed }) {
  const { values } = useFormikContext();
  return (
    <CurrencyField isLocked={hasPayments || toAmount(values.advancePaid) > 0} isClosed={isClosed} />
  );
}

CurrencyFieldState.propTypes = {
  hasPayments: PropTypes.bool.isRequired,
  isClosed: PropTypes.bool.isRequired,
};

/**
 * The derived balance and the submit, inside the provider for the same reason as
 * the currency lock: the preview is `amount - advance - payments`, and `amount`
 * changes as the operator types.
 *
 * In edit mode the payments term comes from the server's own `pendingBalance`
 * (`collected`), applied exactly once — never also from the history, which would
 * subtract every payment twice.
 */
function LoanBalanceFooter({ isSaving, isEdit, collected }) {
  const { values } = useFormikContext();
  const balance = isEdit
    ? pendingBalancePreview(values.amount, values.advancePaid, collected)
    : pendingBalancePreview(values.amount, values.advancePaid);

  return (
    <Row>
      <span>
        {loanFormCopy.balancePreview}:{' '}
        <strong>{balance === null ? '—' : amountWithCurrency(balance, values.currency)}</strong>
      </span>
      <Button type="submit" variant="primary" isWorking={isSaving}>
        {isEdit ? loanFormCopy.saveChanges : loanFormCopy.save}
      </Button>
    </Row>
  );
}

LoanBalanceFooter.propTypes = {
  isSaving: PropTypes.bool.isRequired,
  isEdit: PropTypes.bool.isRequired,
  collected: PropTypes.number.isRequired,
};

LoanForm.propTypes = { loanId: PropTypes.string };

export default LoanForm;
