import React, { Fragment, useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';

import Button from 'shared/components/Button';
import ConfirmModal from 'shared/components/ConfirmModal';
import PageLoader from 'shared/components/PageLoader';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';

import { loanFormCopy, loansListCopy } from '../copy';
import { amountWithCurrency, formatDate, formatLoanNumber, toAmount } from '../money';
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

/**
 * One loan card, rendered for either section.
 *
 * The active and closed cards differ in their balance line and their actions:
 * an active loan offers edit / delete / close, a closed one edit / delete /
 * reopen, and shows its close date and any written-off amount instead of a
 * payment capture. The shared fields stay identical so the two sections read as
 * one list split in two.
 */
function LoanCard({ loan, closed, onEdit, onRemove, onClose, onReopen }) {
  const balance = amountWithCurrency(loan.pendingBalance, loan.currency);
  const closeMessage =
    toAmount(loan.pendingBalance) > 0
      ? loansListCopy.closeMessage(balance)
      : loansListCopy.closePaidMessage;

  return (
    <ListCard>
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
          <strong>{balance}</strong>
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

      {closed && (
        <MetaRow>
          {loan.closedAt && (
            <span>
              <MetaLabel>{loansListCopy.closedAt}: </MetaLabel>
              {formatDate(loan.closedAt)}
            </span>
          )}
          {loan.writtenOffAmount !== null && loan.writtenOffAmount !== undefined && (
            <span>
              <MetaLabel>{loansListCopy.writtenOff}: </MetaLabel>
              {amountWithCurrency(loan.writtenOffAmount, loan.currency)}
            </span>
          )}
        </MetaRow>
      )}

      <Row>
        <Button type="button" onClick={onEdit}>
          {loansListCopy.edit}
        </Button>
        {closed ? (
          <ConfirmModal
            variant="primary"
            title={loansListCopy.reopenTitle}
            message={loansListCopy.reopenMessage}
            confirmText={loansListCopy.reopen}
            renderLink={({ open }) => (
              <Button type="button" onClick={open}>
                {loansListCopy.reopen}
              </Button>
            )}
            onConfirm={({ close }) => onReopen().finally(close)}
          />
        ) : (
          <ConfirmModal
            variant="primary"
            title={loansListCopy.closeTitle}
            message={closeMessage}
            confirmText={loansListCopy.close}
            renderLink={({ open }) => (
              <Button type="button" onClick={open}>
                {loansListCopy.close}
              </Button>
            )}
            onConfirm={({ close }) => onClose().finally(close)}
          />
        )}
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
          onConfirm={({ close }) => onRemove().finally(close)}
        />
      </Row>
    </ListCard>
  );
}

LoanCard.propTypes = {
  loan: PropTypes.object.isRequired,
  closed: PropTypes.bool.isRequired,
  onEdit: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onReopen: PropTypes.func.isRequired,
};

function LoansList() {
  const navigate = useNavigate();
  const [activeLoans, setActiveLoans] = useState([]);
  const [closedLoans, setClosedLoans] = useState([]);
  const [closedExpanded, setClosedExpanded] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(
    () =>
      api.get('/api/v1/loans').then((data) => {
        setActiveLoans(data.loans?.active || []);
        setClosedLoans(data.loans?.closed || []);
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

  const edit = (id) => navigate(`/project/loans/new-loan/${id}`);

  const remove = (id) =>
    api
      .delete(`/api/v1/loans/${id}`)
      .then(() => {
        toast.success(loanFormCopy.removed);
        return load();
      })
      .catch((error) => toast.error(error));

  const closeLoan = (id) =>
    api
      .post(`/api/v1/loans/${id}/close`)
      .then(() => {
        toast.success(loansListCopy.closedToast);
        return load();
      })
      .catch((error) => toast.error(error));

  const reopenLoan = (id) =>
    api
      .post(`/api/v1/loans/${id}/reopen`)
      .then(() => {
        toast.success(loansListCopy.reopenedToast);
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

  const hasLoans = activeLoans.length > 0 || closedLoans.length > 0;

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
        <Button
          type="button"
          data-testid="loans:receipt"
          onClick={() => navigate('/project/loans/receipt')}
        >
          {loansListCopy.generateReceipt}
        </Button>
      </RowSpaced>

      {!hasLoans ? (
        <EmptyState>{loansListCopy.empty}</EmptyState>
      ) : (
        <Fragment>
          <Row>
            <CardTitle as="h3">
              {loansListCopy.activeTitle} ({activeLoans.length})
            </CardTitle>
          </Row>
          {activeLoans.length === 0 ? (
            <EmptyState>{loansListCopy.activeEmpty}</EmptyState>
          ) : (
            <CardGrid>
              {activeLoans.map((loan) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  closed={false}
                  onEdit={() => edit(loan.id)}
                  onRemove={() => remove(loan.id)}
                  onClose={() => closeLoan(loan.id)}
                />
              ))}
            </CardGrid>
          )}

          <Row>
            <CardTitle as="h3">
              {loansListCopy.closedTitle} ({closedLoans.length})
            </CardTitle>
            <Button type="button" onClick={() => setClosedExpanded((value) => !value)}>
              {closedExpanded ? loansListCopy.collapse : loansListCopy.expand}
            </Button>
          </Row>
          {closedExpanded &&
            (closedLoans.length === 0 ? (
              <EmptyState>{loansListCopy.closedEmpty}</EmptyState>
            ) : (
              <CardGrid>
                {closedLoans.map((loan) => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    closed
                    onEdit={() => edit(loan.id)}
                    onRemove={() => remove(loan.id)}
                    onReopen={() => reopenLoan(loan.id)}
                  />
                ))}
              </CardGrid>
            ))}
        </Fragment>
      )}
    </Section>
  );
}

export default LoansList;
