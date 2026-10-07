import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from 'shared/components/Button';
import ConfirmModal from 'shared/components/ConfirmModal';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { loanFormCopy, loansListCopy } from '../copy';
import { amountWithCurrency, formatDate, formatLoanNumber } from '../money';
import { Card, ErrorText, Muted, Panel, Row } from '../Styles';

const borrowerName = (loan) => {
  const { borrower } = loan;
  if (!borrower) return '—';
  return `${borrower.firstName} ${borrower.lastName}`;
};

function LoansList() {
  const navigate = useNavigate();
  const [loans, setLoans] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(
    () =>
      api.get('/api/v1/loans').then((data) => {
        setLoans(data.loans || []);
      }),
    [],
  );

  useEffect(() => {
    setLoadError(null);
    setLoading(true);
    load()
      .catch(() => setLoadError(loansListCopy.loadError))
      .finally(() => setLoading(false));
  }, [load]);

  const retry = () => {
    setLoadError(null);
    setLoading(true);
    load()
      .catch(() => setLoadError(loansListCopy.loadError))
      .finally(() => setLoading(false));
  };

  const remove = (id) =>
    api
      .delete(`/api/v1/loans/${id}`)
      .then(() => {
        toast.success(loanFormCopy.removed);
        return load();
      })
      .catch((error) => toast.error(error));

  if (loadError) {
    return (
      <Panel>
        <div role="alert">
          <ErrorText>{loadError}</ErrorText>
          <Button onClick={retry}>{loansListCopy.retry}</Button>
        </div>
      </Panel>
    );
  }

  if (isLoading) return <Panel>{loansListCopy.loading}</Panel>;

  if (loans.length === 0) return <Panel>{loansListCopy.empty}</Panel>;

  return (
    <Panel>
      <h2>{loansListCopy.title}</h2>
      {loans.map((loan) => (
        <Card key={loan.id}>
          <Row>
            <strong>Nº {formatLoanNumber(loan.number)}</strong>
            <span>{amountWithCurrency(loan.amount, loan.currency)}</span>
            <Muted>{borrowerName(loan)}</Muted>
            <Muted>{formatDate(loan.date)}</Muted>
          </Row>
          <p>
            {loansListCopy.concept}: {loan.concept} · {loansListCopy.lender}: {loan.lender} ·{' '}
            {loansListCopy.city}: {loan.city}
          </p>
          {loan.installmentAmount !== null && loan.installmentAmount !== undefined && (
            <p>
              {loansListCopy.installment}:{' '}
              {amountWithCurrency(loan.installmentAmount, loan.currency)}
            </p>
          )}
          <p>
            {loansListCopy.balance}:{' '}
            <strong>{amountWithCurrency(loan.pendingBalance, loan.currency)}</strong>
          </p>
          <Row>
            <Button onClick={() => navigate(`/loans/new-loan/${loan.id}`)}>
              {loansListCopy.edit}
            </Button>
            <ConfirmModal
              variant="danger"
              title={loansListCopy.removeTitle}
              message={loansListCopy.removeMessage}
              confirmText={loansListCopy.remove}
              renderLink={({ open }) => <Button onClick={open}>{loansListCopy.remove}</Button>}
              onConfirm={({ close }) => remove(loan.id).finally(close)}
            />
          </Row>
        </Card>
      ))}
    </Panel>
  );
}

export default LoansList;
