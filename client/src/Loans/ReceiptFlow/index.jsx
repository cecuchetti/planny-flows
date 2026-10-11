/* eslint-disable react/require-default-props */
import React, { Fragment, useCallback, useEffect, useState } from 'react';

import Button from 'shared/components/Button';
import Input from 'shared/components/Input';
import PageLoader from 'shared/components/PageLoader';
import Select from 'shared/components/Select';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';

import Receipt from '../Receipt';
import { borrowerFullName } from '../Receipt/receiptData';
import { receiptFlowCopy } from '../copy';
import { amountWithCurrency, formatLoanNumber, toAmount } from '../money';
import {
  CardTitle,
  EmptyState,
  ErrorText,
  FieldErrorText,
  FieldLabelText,
  FieldShell,
  Row,
  Section,
} from '../Styles';

/** The editable default: min(installment, balance) when set, else the balance. */
const prefillAmount = (loan) => {
  const balance = toAmount(loan.pendingBalance) || 0;
  const installment = toAmount(loan.installmentAmount);
  if (installment !== null && installment !== undefined && installment > 0) {
    return String(Math.min(installment, balance).toFixed(2));
  }
  return String(balance.toFixed(2));
};

const optionLabel = (loan) =>
  `${formatLoanNumber(loan.number)} · ${borrowerFullName(loan)} · ${amountWithCurrency(
    loan.amount,
    loan.currency,
  )} · ${amountWithCurrency(loan.pendingBalance, loan.currency)}`;

/*
 * "Generar Recibo": register a payment and render its receipt in one action.
 *
 * Only active loans are selectable (`GET /loans` already splits them), the amount
 * prefills per the installment rule and stays editable, and confirming posts to
 * the Epic 2 payment API and renders the receipt from the returned snapshot. The
 * toast reads `status` from that response so a payment that closes the loan says
 * so explicitly. Changing the selection hides any rendered receipt.
 */
function ReceiptFlow() {
  const [activeLoans, setActiveLoans] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState(null);
  const [isPaying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const load = useCallback(
    () => api.get('/api/v1/loans').then((data) => setActiveLoans(data.loans?.active || [])),
    [],
  );

  useEffect(() => {
    setLoadError(null);
    setLoading(true);
    load()
      .catch(() => setLoadError(receiptFlowCopy.loadError))
      .finally(() => setLoading(false));
  }, [load]);

  const selectedLoan = activeLoans.find((loan) => loan.id === selectedId) || null;

  const options = activeLoans.map((loan) => ({ value: loan.id, label: optionLabel(loan) }));

  const handleSelect = (id) => {
    const loan = activeLoans.find((item) => item.id === id) || null;
    setSelectedId(id);
    setReceipt(null);
    setAmountError(null);
    setAmount(loan ? prefillAmount(loan) : '');
  };

  const retry = () => {
    setLoadError(null);
    setLoading(true);
    load()
      .catch(() => setLoadError(receiptFlowCopy.loadError))
      .finally(() => setLoading(false));
  };

  const confirm = () => {
    if (!selectedLoan) {
      setAmountError(receiptFlowCopy.noLoan);
      return;
    }
    const parsed = toAmount(amount);
    if (parsed === null || parsed <= 0) {
      setAmountError(receiptFlowCopy.invalidAmount);
      return;
    }
    setAmountError(null);
    setPaying(true);
    api
      .post(`/api/v1/loans/${selectedLoan.id}/payments`, { amount })
      .then((data) => {
        const closed = data.status === 'closed';
        toast.success(closed ? receiptFlowCopy.closedToast : receiptFlowCopy.paymentToast);
        setReceipt({ payment: data.payment, loan: selectedLoan });
        // Refresh the selector so a just-closed loan leaves Activos and balances
        // are current. The rendered receipt keeps the loan it was captured with.
        // A failed refresh must not surface as a "payment failed" toast — the
        // payment already succeeded and the receipt is on screen.
        return load()
          .catch(() => {})
          .then(() => {
            if (closed) {
              setSelectedId(null);
              setAmount('');
            }
          });
      })
      .catch((error) => toast.error(error))
      .finally(() => setPaying(false));
  };

  if (loadError) {
    return (
      <Section>
        <div role="alert">
          <ErrorText>{loadError}</ErrorText>
          <Button type="button" onClick={retry}>
            {receiptFlowCopy.retry}
          </Button>
        </div>
      </Section>
    );
  }

  if (isLoading) return <PageLoader />;

  return (
    <Section>
      <CardTitle>{receiptFlowCopy.title}</CardTitle>

      {activeLoans.length === 0 ? (
        <EmptyState>{receiptFlowCopy.empty}</EmptyState>
      ) : (
        <Fragment>
          <Row>
            <FieldShell data-testid="form-field:receiptLoan">
              <FieldLabelText htmlFor="receipt-loan">{receiptFlowCopy.selectLabel}</FieldLabelText>
              <div id="receipt-loan">
                <Select
                  name="receipt-loan"
                  value={selectedId}
                  onChange={handleSelect}
                  options={options}
                  placeholder={receiptFlowCopy.selectPlaceholder}
                />
              </div>
            </FieldShell>
          </Row>

          {selectedLoan && (
            <Row>
              <FieldShell data-testid="form-field:receiptAmount">
                <FieldLabelText htmlFor="receipt-amount">{receiptFlowCopy.amount}</FieldLabelText>
                <Input
                  id="receipt-amount"
                  name="receiptAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={setAmount}
                />
              </FieldShell>
              <Button type="button" variant="primary" isWorking={isPaying} onClick={confirm}>
                {isPaying ? receiptFlowCopy.confirming : receiptFlowCopy.confirm}
              </Button>
            </Row>
          )}

          {amountError && <FieldErrorText role="alert">{amountError}</FieldErrorText>}
        </Fragment>
      )}

      {/*
       * Rendered outside the selector so a payment that closes the *last* active
       * loan still shows its receipt: the list refetches to empty, but the proof
       * that was just handed over must not vanish with it.
       */}
      {receipt && <Receipt payment={receipt.payment} loan={receipt.loan} withActions />}
    </Section>
  );
}

export default ReceiptFlow;
