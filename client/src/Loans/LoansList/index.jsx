import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Button from 'shared/components/Button';
import ConfirmModal from 'shared/components/ConfirmModal';
import PageLoader from 'shared/components/PageLoader';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';

import { loanFormCopy, loansListCopy } from '../copy';
import { amountWithCurrency, formatDate, formatLoanNumber } from '../money';
import {
  CardAmount,
  CardGrid,
  CardHeader,
  CardKey,
  CardTitle,
  Chip,
  EmptyState,
  ErrorText,
  ListCard,
  MetaLabel,
  MetaRow,
  Row,
  RowSpaced,
  Section,
} from '../Styles';

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
      <Section>
        <div role="alert">
          <ErrorText>{loadError}</ErrorText>
          <Button type="button" onClick={retry}>
            {loansListCopy.retry}
          </Button>
        </div>
      </Section>
    );
  }

  if (isLoading) return <PageLoader />;

  return (
    <Section>
      <CardTitle>{loansListCopy.title}</CardTitle>

      <RowSpaced>
        <Button
          type="button"
          variant="primary"
          data-testid="loans:new"
          onClick={() => navigate('/project/loans/new-loan')}
        >
          {loansListCopy.newLoan}
        </Button>
      </RowSpaced>

      {loans.length === 0 ? (
        <EmptyState>{loansListCopy.empty}</EmptyState>
      ) : (
        <CardGrid>
          {loans.map((loan) => (
            <ListCard key={loan.id}>
              <CardHeader>
                <CardKey>
                  {loansListCopy.number} {formatLoanNumber(loan.number)}
                </CardKey>
                <CardAmount>{amountWithCurrency(loan.amount, loan.currency)}</CardAmount>
                <Chip>{loan.currency}</Chip>
              </CardHeader>

              <MetaRow>
                <span>
                  <MetaLabel>{loansListCopy.borrower}: </MetaLabel>
                  {borrowerName(loan)}
                </span>
                <span>
                  <MetaLabel>{loansListCopy.date}: </MetaLabel>
                  {formatDate(loan.date)}
                </span>
                <span>
                  <MetaLabel>{loansListCopy.balance}: </MetaLabel>
                  <strong>{amountWithCurrency(loan.pendingBalance, loan.currency)}</strong>
                </span>
              </MetaRow>

              <MetaRow>
                <span>
                  <MetaLabel>{loansListCopy.concept}: </MetaLabel>
                  {loan.concept}
                </span>
                <span>
                  <MetaLabel>{loansListCopy.lender}: </MetaLabel>
                  {loan.lender}
                </span>
                {loan.city && (
                  <span>
                    <MetaLabel>{loansListCopy.city}: </MetaLabel>
                    {loan.city}
                  </span>
                )}
                {loan.installmentAmount !== null && loan.installmentAmount !== undefined && (
                  <span>
                    <MetaLabel>{loansListCopy.installment}: </MetaLabel>
                    {amountWithCurrency(loan.installmentAmount, loan.currency)}
                  </span>
                )}
              </MetaRow>

              <Row>
                <Button
                  type="button"
                  onClick={() => navigate(`/project/loans/new-loan/${loan.id}`)}
                >
                  {loansListCopy.edit}
                </Button>
                <ConfirmModal
                  variant="danger"
                  title={loansListCopy.removeTitle}
                  message={loansListCopy.removeMessage}
                  confirmText={loansListCopy.remove}
                  renderLink={({ open }) => (
                    <Button type="button" onClick={open}>
                      {loansListCopy.remove}
                    </Button>
                  )}
                  onConfirm={({ close }) => remove(loan.id).finally(close)}
                />
              </Row>
            </ListCard>
          ))}
        </CardGrid>
      )}
    </Section>
  );
}

export default LoansList;
