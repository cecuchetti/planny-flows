/* eslint-disable react/require-default-props */
import React, { Fragment, useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useParams } from 'react-router-dom';
import { useFormikContext } from 'formik';

import Button from 'shared/components/Button';
import ConfirmModal from 'shared/components/ConfirmModal';
import Form from 'shared/components/Form';
import Input from 'shared/components/Input';
import Modal from 'shared/components/Modal';
import PageLoader from 'shared/components/PageLoader';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';

import BorrowerPicker from '../BorrowerPicker';
import Receipt from '../Receipt';
import { loanFormCopy, paymentsCopy } from '../copy';
import {
  CURRENCIES,
  amountWithCurrency,
  collectedFromLoan,
  formatDate,
  formatLoanNumber,
  paymentsTotal,
  pendingBalancePreview,
  toAmount,
} from '../money';

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
    <div className="flex flex-col gap-1.5" data-testid="form-field:paymentAmount">
      <label
        htmlFor="loan-payment-amount"
        className="font-label-md text-label-md font-medium text-on-surface"
      >
        {paymentsCopy.amount}
      </label>
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
    </div>
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
function PaymentRow({ payment, currency, onReverse, onUndoReversal, onViewReceipt }) {
  const isReversed = Boolean(payment.reversedAt);
  const title = isReversed ? paymentsCopy.undoTitle : paymentsCopy.reverseTitle;
  const message = isReversed ? paymentsCopy.undoMessage : paymentsCopy.reverseMessage;
  const confirmText = isReversed ? paymentsCopy.undoReversal : paymentsCopy.reverse;
  const action = isReversed ? onUndoReversal : onReverse;

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-xl ${
        isReversed ? 'bg-error-container/40' : 'bg-surface-container-low hover:bg-surface-container'
      } transition-colors`}
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span
            className={`font-label-md text-label-md font-semibold text-on-surface ${
              isReversed ? 'line-through opacity-70' : ''
            }`}
          >
            {payment.description || `#${payment.id}`}
          </span>
          <span className="font-code-key text-[11px] text-outline">{formatDate(payment.date)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <button
            type="button"
            className="font-body-sm text-[11px] text-primary hover:underline flex items-center gap-0.5"
            onClick={() => onViewReceipt(payment)}
          >
            <span className="material-symbols-outlined text-[13px]">visibility</span>
            {paymentsCopy.viewReceipt}
          </button>
          <span className="text-outline text-[10px]">·</span>
          <ConfirmModal
            variant={isReversed ? 'primary' : 'danger'}
            title={title}
            message={message}
            confirmText={confirmText}
            renderLink={({ open }) => (
              <button
                type="button"
                className={`font-body-sm text-[11px] ${
                  isReversed ? 'text-primary font-semibold' : 'text-error'
                } hover:underline`}
                onClick={open}
              >
                {confirmText}
              </button>
            )}
            onConfirm={({ close }) => action(payment.id).finally(close)}
          />
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span
          className={`font-code-key text-label-md font-bold ${
            isReversed ? 'text-error line-through' : 'text-tertiary'
          }`}
        >
          +{amountWithCurrency(payment.amount, currency)}
        </span>
        <span className="font-body-sm text-[10px] text-outline uppercase font-semibold">
          {currency}
        </span>
      </div>
      {isReversed && (
        <span className="px-1.5 py-0.5 rounded bg-error text-on-error font-body-sm text-[10px] font-bold uppercase ml-2">
          {paymentsCopy.reversedTag}
        </span>
      )}
    </div>
  );
}

PaymentRow.propTypes = {
  payment: PropTypes.shape({
    id: PropTypes.number.isRequired,
    date: PropTypes.string,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    reversedAt: PropTypes.string,
    description: PropTypes.string,
  }).isRequired,
  currency: PropTypes.string.isRequired,
  onReverse: PropTypes.func.isRequired,
  onUndoReversal: PropTypes.func.isRequired,
  onViewReceipt: PropTypes.func.isRequired,
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
  // The full saved loan, kept for the receipt: the descriptive fields (number,
  // city, lender, concept, borrower) come from it, not from the payment.
  const [loan, setLoan] = useState(null);
  const [receiptPayment, setReceiptPayment] = useState(null);

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
      setLoan(data.loan);
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
        // The list is where the saved loan is visible, and it now shares its page
        // with the summary.
        navigate('/project/loans');
      })
      .catch((error) => toast.error(error))
      .finally(() => setSaving(false));
  };

  const amortizationPercent =
    loan && loan.amount ? Math.round((collected / parseFloat(loan.amount)) * 100) : 0;

  let paymentsContent;
  if (paymentsLoading) {
    paymentsContent = (
      <p className="text-on-surface-variant font-body-md text-body-md my-3">
        {paymentsCopy.loading}
      </p>
    );
  } else if (paymentsError) {
    paymentsContent = (
      <div role="alert">
        <p className="text-error font-label-md text-label-md my-2">{paymentsError}</p>
        <Button type="button" onClick={retryPayments}>
          {paymentsCopy.retry}
        </Button>
      </div>
    );
  } else if (payments.length === 0) {
    paymentsContent = (
      <p className="text-on-surface-variant font-body-md text-body-md my-3">{paymentsCopy.empty}</p>
    );
  } else {
    // Only what is still in force is collected: a reversed row stays visible but
    // does not count, exactly as the server leaves it out of `pendingBalance`.
    const paid = paymentsTotal(payments);
    paymentsContent = (
      <Fragment>
        <div className="p-3 rounded-xl bg-surface-container-low flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-outline text-[18px]">
              history_toggle_off
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {paymentsCopy.total}:
            </span>
          </div>
          <span className="font-code-key text-label-md font-bold text-on-surface">
            {amountWithCurrency(paid, initialForm.currency)}
          </span>
        </div>
        <h3 className="font-headline-md text-headline-md font-semibold text-on-surface mb-3">
          {paymentsCopy.history}
        </h3>
        <div className="flex flex-col gap-2.5">
          {payments.map((payment) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              currency={initialForm.currency}
              onReverse={reversePayment}
              onUndoReversal={undoPaymentReversal}
              onViewReceipt={setReceiptPayment}
            />
          ))}
        </div>
      </Fragment>
    );
  }

  const paymentSection = (
    <div className="p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-tertiary-container/15 text-tertiary flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px]">payments</span>
          </div>
          <h3 className="font-headline-md text-headline-md font-semibold text-on-surface">
            {paymentsCopy.title}
          </h3>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-tertiary/10 text-tertiary font-label-md text-[11px] font-bold">
          {isClosed ? 'Cerrado' : 'En curso'}
        </span>
      </div>
      {/*
       * Nested form-shaped markup would be invalid HTML, so the payment capture
       * is a plain row: the button handles the write itself and the loan form
       * around it owns the only submit. A closed loan accepts no new payments
       * (FR18), so the capture is hidden and the history is read-only.
       */}
      {!isClosed && (
        <div className="flex flex-col gap-2">
          <label htmlFor="loan-payment-amount" className="font-label-md text-label-md font-medium text-on-surface">
            {paymentsCopy.amount}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                id="loan-payment-amount"
                name="paymentAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder={paymentsCopy.amountPlaceholder}
                value={paymentAmount}
                onChange={setPaymentAmount}
              />
            </div>
            <Button type="button" variant="primary" isWorking={isPaying} onClick={registerPayment}>
              {isPaying ? paymentsCopy.registering : paymentsCopy.register}
            </Button>
          </div>
        </div>
      )}
      {paymentsContent}
      {/* Total cobrado acumulado */}
      <div className="p-3 rounded-xl bg-surface-container-low flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-outline text-[18px]">
            history_toggle_off
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Total cobrado acumulado:
          </span>
        </div>
        <span className="font-code-key text-label-md font-bold text-on-surface">
          {amountWithCurrency(collected, initialForm.currency)}
        </span>
      </div>
    </div>
  );

  if (isLoading) return <PageLoader />;

  if (loadError) {
    return (
      <div className="p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm">
        <div role="alert">
          <p className="text-error font-label-md text-label-md">{loadError}</p>
          <Button type="button" onClick={retry}>
            {loanFormCopy.retry}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Fragment>
      {/* Header con modo toggle, estado, badge */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-surface-container-low p-space-lg rounded-2xl shadow-sm">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-space-sm">
            <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
              {id ? loanFormCopy.editTitle : loanFormCopy.createTitle}
            </h1>
            {/* Mode Toggle Pill */}
            <div className="inline-flex p-0.5 rounded-lg bg-surface-container-highest">
              <span className="px-2.5 py-1 rounded-md text-[11px] font-label-md uppercase tracking-wider font-bold bg-surface-container-lowest text-primary shadow-xs transition-all">
                {loanFormCopy.editTitle}
              </span>
              <span className="px-2.5 py-1 rounded-md text-[11px] font-label-md uppercase tracking-wider font-bold text-on-surface-variant transition-all">
                {loanFormCopy.createTitle}
              </span>
            </div>
            {id && (
              <Fragment>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-tertiary-container/15 text-tertiary font-label-md text-label-md font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                  {isClosed ? loanFormCopy.statusClosed : loanFormCopy.statusActive}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-surface-container font-code-key text-code-key text-on-surface-variant font-semibold">
                  Nº {formatLoanNumber(loan?.number)} · {initialForm.currency}
                </span>
                {isClosed && writtenOffAmount !== null && (
                  <span className="px-2 py-0.5 rounded-md bg-surface-container font-code-key text-code-key text-on-surface-variant font-semibold">
                    {loanFormCopy.writtenOffLabel}: {amountWithCurrency(writtenOffAmount, initialForm.currency)}
                  </span>
                )}
              </Fragment>
            )}
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Gestioná el capital prestado, condiciones pactadas y registrá pagos.
          </p>
        </div>
        {/* Amortización snapshot */}
        {id && loan && (
          <div className="flex items-center gap-space-md self-start md:self-auto">
            <div className="flex flex-col items-end">
              <span className="font-overline text-overline uppercase tracking-wider text-outline">
                Amortización
              </span>
              <span className="font-code-key text-headline-md text-primary font-bold">
                {amortizationPercent}%
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[26px]">account_balance_wallet</span>
            </div>
          </div>
        )}
      </div>

      {isClosed && (
        <p className="text-on-surface-variant font-body-md text-body-md mt-2">
          {loanFormCopy.closedNotice}
        </p>
      )}

      {/* Main two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start mt-space-lg">
        {/* LEFT COLUMN: Loan Details */}
        <div className="lg:col-span-7 flex flex-col gap-space-lg bg-surface-container-lowest p-space-lg rounded-2xl shadow-sm">
          <div className="flex items-center justify-between pb-space-sm">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">assignment</span>
              <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">
                Datos del Préstamo
              </h2>
            </div>
            {id && loan && (
              <span className="font-overline text-overline uppercase tracking-wider text-outline">
                ID #{formatLoanNumber(loan.number)}
              </span>
            )}
          </div>

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
              <div className="flex flex-col gap-1.5 relative" data-testid="form-field:borrower">
                <label
                  htmlFor="loan-borrower-picker"
                  className="font-label-md text-label-md font-medium text-on-surface"
                >
                  {loanFormCopy.picker}
                </label>
                <div id="loan-borrower-picker">
                  <BorrowerPicker value={borrower} onChange={selectBorrower} />
                </div>
                {borrowerError && (
                  <p className="text-error font-label-md text-label-md mt-1.5" role="alert">
                    {borrowerError}
                  </p>
                )}
              </div>

              {/* Monto, Fecha, Moneda — 2 columnas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md mt-4">
                <Form.Field.Input
                  name="amount"
                  label={loanFormCopy.amount}
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={isClosed}
                />
                <Form.Field.DatePicker name="date" label={loanFormCopy.date} withTime={false} />
              </div>

              {/* Concepto, Prestamista — 2 columnas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md mt-4">
                <Form.Field.Input name="concept" label={loanFormCopy.concept} />
                <Form.Field.Input name="lender" label={loanFormCopy.lender} />
              </div>

              {/* Ciudad, Moneda */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md mt-4">
                <Form.Field.Input name="city" label={loanFormCopy.city} />
                <CurrencyFieldState hasPayments={payments.length > 0} isClosed={isClosed} />
              </div>

              {/* Condiciones de Devolución */}
              <div className="flex flex-col gap-space-sm pt-4">
                <span className="font-overline text-overline uppercase tracking-wider text-outline">
                  Condiciones de Devolución
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-space-sm">
                  <div className="p-3 rounded-xl bg-surface-container-low flex flex-col gap-1">
                    <span className="font-body-sm text-[11px] text-on-surface-variant font-medium">
                      {loanFormCopy.advancePaid}
                    </span>
                    <span className="font-code-key text-label-lg font-bold text-on-surface">
                      {amountWithCurrency(initialForm.advancePaid, initialForm.currency)}
                    </span>
                    <span className="font-body-sm text-[10px] text-tertiary">
                      Ingresado al inicio
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-container-low flex flex-col gap-1">
                    <span className="font-body-sm text-[11px] text-on-surface-variant font-medium">
                      {loanFormCopy.installmentAmount}
                    </span>
                    <span className="font-code-key text-label-lg font-bold text-on-surface">
                      {initialForm.installmentAmount
                        ? amountWithCurrency(initialForm.installmentAmount, initialForm.currency)
                        : '—'}
                    </span>
                    <span className="font-body-sm text-[10px] text-on-surface-variant">
                      Pactada mensual
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-container-low flex flex-col gap-1">
                    <span className="font-body-sm text-[11px] text-on-surface-variant font-medium">
                      Cuotas pactadas
                    </span>
                    <span className="font-code-key text-label-lg font-bold text-secondary">
                      {loan?.installmentCount || '—'}
                    </span>
                    <span className="font-body-sm text-[10px] text-secondary font-semibold">
                      {loan?.currentInstallment
                        ? `Cuota ${loan.currentInstallment}/${loan.installmentCount} en curso`
                        : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live Calculated Balance */}
              <LoanBalanceFooter isEdit={Boolean(id)} collected={collected} />

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-space-sm mt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/project/loans')}
                  className="px-4 py-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-label-md text-label-md transition-colors"
                >
                  {loanFormCopy.backToList}
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    isWorking={isSaving}
                    className="h-10 px-5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md font-semibold flex items-center gap-2 shadow-sm transition-all hover:shadow-md"
                  >
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    <span>{id ? loanFormCopy.saveChanges : loanFormCopy.save}</span>
                  </Button>
                </div>
              </div>
            </Form.Element>
          </Form>
        </div>

        {/* RIGHT COLUMN: Payments & Collections */}
        <div className="lg:col-span-5 flex flex-col gap-space-lg">{id && paymentSection}</div>
      </div>

      {/*
       * The historical receipt, rendered from the chosen payment's snapshot and
       * the saved loan's descriptive fields. It opens over the edit view rather
       * than navigating away, so the operator's unsaved edits are not disturbed.
       */}
      {receiptPayment && loan && (
        <Modal
          isOpen
          width={720}
          testid="modal:receipt"
          onClose={() => setReceiptPayment(null)}
          renderContent={() => <Receipt payment={receiptPayment} loan={loan} withActions />}
        />
      )}
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
function LoanBalanceFooter({ isEdit, collected }) {
  const { values } = useFormikContext();
  const balance = isEdit
    ? pendingBalancePreview(values.amount, values.advancePaid, collected)
    : pendingBalancePreview(values.amount, values.advancePaid);

  return (
    <div className="p-space-md rounded-2xl bg-secondary-fixed/30 flex flex-col gap-space-sm shadow-xs mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-[22px]">query_stats</span>
          <span className="font-label-lg text-label-lg font-bold text-on-surface">
            {loanFormCopy.balancePreview}:
          </span>
        </div>
        <span className="font-code-key text-headline-md font-bold text-secondary tracking-tight">
          {balance === null ? '—' : amountWithCurrency(balance, values.currency)}
        </span>
      </div>
      {/* Progress bar */}
      {isEdit && (
        <div className="flex flex-col gap-1.5 pt-1">
          <div className="w-full h-2.5 rounded-full bg-surface-container overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500"
              style={{
                width: `${
                  values.amount && collected
                    ? Math.min(100, Math.round((collected / parseFloat(values.amount)) * 100))
                    : 0
                }%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between font-body-sm text-[11px] text-on-surface-variant">
            <span>
              <strong>
                {values.amount && collected
                  ? Math.min(100, Math.round((collected / parseFloat(values.amount)) * 100))
                  : 0}
                %
              </strong>{' '}
              amortizado ({amountWithCurrency(collected, values.currency)} cobrados)
            </span>
            <span>Total pactado: {amountWithCurrency(values.amount, values.currency)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

LoanBalanceFooter.propTypes = {
  isEdit: PropTypes.bool.isRequired,
  collected: PropTypes.number.isRequired,
};

LoanForm.propTypes = { loanId: PropTypes.string };

export default LoanForm;
