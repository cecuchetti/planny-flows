import React, { Fragment, useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';

import Button from 'shared/components/Button';
import TailwindConfirmModal from 'shared/components/ConfirmModal/TailwindConfirmModal';
import CloseLoanModal from 'Loans/CloseLoanModal';
import PageLoader from 'shared/components/PageLoader';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';

import { loanFormCopy, loansListCopy } from '../copy';
import {
  amountWithCurrency,
  formatDate,
  formatLoanNumber,
  toAmount,
  collectedFromLoan,
} from '../money';

const borrowerName = (loan) => {
  const { borrower } = loan;
  if (!borrower) return '—';
  return `${borrower.firstName} ${borrower.lastName}`;
};

/** Two-letter initials for the avatar circle. */
const borrowerInitials = (loan) => {
  const { borrower } = loan;
  if (!borrower) return '—';
  return `${(borrower.firstName || '')[0] || ''}${(borrower.lastName || '')[0] || ''}`.toUpperCase();
};

/** Recovery percentage, 0–100. */
const recoveryPercent = (loan) => {
  const collected = collectedFromLoan(loan);
  const amount = toAmount(loan.amount) || 0;
  if (amount <= 0) return 0;
  return Math.round(Math.min((collected / amount) * 100, 100));
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
function LoanCard({ loan, closed, onEdit, onRemove, onClose, onReopen, onReceipt }) {
  const balance = amountWithCurrency(loan.pendingBalance, loan.currency);

  const pct = recoveryPercent(loan);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);

  return (
    <article className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-space-md">
      <div className="space-y-3">
        {/* Card Header: Nº + Chip + Amount */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-code-key text-code-key text-outline font-semibold">
              {loansListCopy.number} {formatLoanNumber(loan.number)}
            </span>
            <span className="px-2 py-0.5 rounded bg-secondary-fixed text-secondary font-code-key text-[10px] font-bold">
              {loan.currency}
            </span>
          </div>
          <div className="font-code-key text-headline-md text-on-surface font-bold">
            {amountWithCurrency(loan.amount, loan.currency)}
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-body-sm pt-1">
          {/* Persona */}
          <div>
            <span className="font-overline text-[10px] text-outline uppercase block">
              {loansListCopy.borrower}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-6 h-6 rounded-full bg-secondary text-on-secondary font-code-key text-[11px] font-bold flex items-center justify-center">
                {borrowerInitials(loan)}
              </div>
              <span className="font-label-md text-label-md text-on-surface font-semibold">
                {borrowerName(loan)}
              </span>
            </div>
          </div>
          {/* Fecha inicio */}
          <div>
            <span className="font-overline text-[10px] text-outline uppercase block">
              {loansListCopy.date}
            </span>
            <span className="font-code-key text-body-sm text-on-surface">
              {formatDate(loan.date)}
            </span>
          </div>
          {/* Saldo pendiente */}
          <div>
            <span className="font-overline text-[10px] text-outline uppercase block">
              {loansListCopy.balance}
            </span>
            <span className="font-code-key text-body-md text-secondary font-bold">{balance}</span>
          </div>
          {/* Cuota mensual */}
          {loan.installmentAmount !== null && loan.installmentAmount !== undefined && (
            <div>
              <span className="font-overline text-[10px] text-outline uppercase block">
                {loansListCopy.installment}
              </span>
              <span className="font-code-key text-body-sm text-on-surface font-medium">
                {amountWithCurrency(loan.installmentAmount, loan.currency)}
              </span>
            </div>
          )}
          {!loan.installmentAmount && <div />}

          {/* Concept row - full width */}
          <div className="col-span-2 bg-surface-container-low/70 p-2 rounded flex items-center justify-between text-body-sm">
            <span className="text-outline">
              {loansListCopy.concept}:{' '}
              <strong className="text-on-surface font-medium">{loan.concept}</strong>
            </span>
            <span className="text-outline text-[11px]">
              {[loan.city, loan.lender ? `Prestamista: ${loan.lender}` : '']
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>

          {/* Closed loan extra info */}
          {closed && (
            <>
              {loan.closedAt && (
                <div>
                  <span className="font-overline text-[10px] text-outline uppercase block">
                    {loansListCopy.closedAt}
                  </span>
                  <span className="font-code-key text-body-sm text-on-surface">
                    {formatDate(loan.closedAt)}
                  </span>
                </div>
              )}
              {loan.writtenOffAmount !== null && loan.writtenOffAmount !== undefined && (
                <div>
                  <span className="font-overline text-[10px] text-outline uppercase block">
                    {loansListCopy.writtenOff}
                  </span>
                  <span className="font-code-key text-body-sm text-on-surface font-medium">
                    {amountWithCurrency(loan.writtenOffAmount, loan.currency)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between font-label-md text-[11px]">
            <span className="text-outline">Recuperado</span>
            <span className="font-code-key font-bold text-tertiary">{pct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-tertiary rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Action Row */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          className="h-7 px-2.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface text-body-sm font-label-md transition-colors"
          onClick={onEdit}
        >
          {loansListCopy.edit}
        </button>
        <div className="flex items-center gap-2">
          {closed ? (
            <React.Fragment>
              <button
                type="button"
                className="text-primary hover:text-primary-container font-label-md text-body-sm flex items-center gap-1 transition-colors"
                onClick={() => setReopenModalOpen(true)}
              >
                {loansListCopy.reopen}
              </button>
              <TailwindConfirmModal
                isOpen={reopenModalOpen}
                onClose={() => setReopenModalOpen(false)}
                variant="primary"
                title={loansListCopy.reopenTitle}
                message={loansListCopy.reopenMessage}
                confirmText={loansListCopy.reopen}
                cancelText="Cancelar"
                onConfirm={({ close }) => onReopen().finally(close)}
              />
            </React.Fragment>
          ) : (
            <React.Fragment>
              <button
                type="button"
                data-testid="loans:card-receipt"
                className="text-primary hover:text-primary-container font-label-md text-body-sm flex items-center gap-1 transition-colors"
                onClick={onReceipt}
              >
                <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                {loansListCopy.generateReceipt}
              </button>
              <span className="text-outline text-xs">·</span>
              <button
                type="button"
                className="text-outline hover:text-on-surface font-label-md text-body-sm transition-colors"
                onClick={() => setCloseModalOpen(true)}
              >
                {loansListCopy.close}
              </button>
              <CloseLoanModal
                isOpen={closeModalOpen}
                onClose={() => setCloseModalOpen(false)}
                loan={loan}
                onConfirm={({ close, mode }) => {
                  // For 'close': call the existing close action (balance $0 / fully paid)
                  // For 'condone': could call a condone endpoint; for now close the loan
                  onClose().finally(close);
                }}
              />
            </React.Fragment>
          )}
          <React.Fragment>
            <button
              type="button"
              className="text-outline hover:text-error font-label-md text-body-sm transition-colors"
              onClick={() => setRemoveModalOpen(true)}
            >
              {loansListCopy.remove}
            </button>
            <TailwindConfirmModal
              isOpen={removeModalOpen}
              onClose={() => setRemoveModalOpen(false)}
              variant="danger"
              title={loansListCopy.removeTitle}
              message={loansListCopy.removeMessage}
              confirmText={loansListCopy.remove}
              cancelText="Cancelar"
              onConfirm={({ close }) => onRemove().finally(close)}
            />
          </React.Fragment>
        </div>
      </div>
    </article>
  );
}

LoanCard.propTypes = {
  loan: PropTypes.object.isRequired,
  closed: PropTypes.bool.isRequired,
  onEdit: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onReopen: PropTypes.func.isRequired,
  onReceipt: PropTypes.func,
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
      <section data-testid="loans:list" className="space-y-space-md">
        <div role="alert">
          <p className="text-error text-body-sm font-body-sm m-2">{loadError}</p>
          <Button type="button" onClick={retry}>
            {loansListCopy.retry}
          </Button>
        </div>
      </section>
    );
  }

  if (isLoading) return <PageLoader />;

  const hasLoans = activeLoans.length > 0 || closedLoans.length > 0;

  return (
    <section data-testid="loans:list" className="space-y-space-md">
      <h2 className="font-headline-md text-headline-md text-on-surface mb-4">
        {loansListCopy.title}
      </h2>

      <div className="flex items-center gap-space-sm">
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
      </div>

      {!hasLoans ? (
        <p className="text-on-surface-variant text-body-sm font-body-sm mt-3">
          {loansListCopy.empty}
        </p>
      ) : (
        <Fragment>
          {/* Active Loans Section */}
          <div className="space-y-space-md mt-space-md">
            <div className="flex items-center gap-space-sm">
              <h3 className="font-headline-md text-headline-md text-on-surface">
                {loansListCopy.activeTitle}
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-secondary font-label-md text-label-md font-semibold">
                {activeLoans.length}
              </span>
            </div>
            {activeLoans.length === 0 ? (
              <p className="text-on-surface-variant text-body-sm font-body-sm">
                {loansListCopy.activeEmpty}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                {activeLoans.map((loan) => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    closed={false}
                    onEdit={() => edit(loan.id)}
                    onRemove={() => remove(loan.id)}
                    onClose={() => closeLoan(loan.id)}
                    onReceipt={() => navigate(`/project/loans/receipt?loan=${loan.id}`)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Closed Loans Section */}
          <div className="space-y-space-md mt-space-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  {loansListCopy.closedTitle}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md">
                  {closedLoans.length} {loansListCopy.expand.toLowerCase()}
                </span>
              </div>
              <button
                type="button"
                className="h-8 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md flex items-center gap-1 transition-colors"
                onClick={() => setClosedExpanded((value) => !value)}
              >
                <span>
                  {closedExpanded
                    ? loansListCopy.collapse
                    : `${loansListCopy.expand} (${closedLoans.length})`}
                </span>
                <span
                  className={`material-symbols-outlined text-[18px] transition-transform ${closedExpanded ? 'rotate-180' : ''}`}
                >
                  expand_more
                </span>
              </button>
            </div>
            {closedExpanded &&
              (closedLoans.length === 0 ? (
                <p className="text-on-surface-variant text-body-sm font-body-sm">
                  {loansListCopy.closedEmpty}
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
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
                </div>
              ))}
          </div>
        </Fragment>
      )}
    </section>
  );
}

export default LoansList;
