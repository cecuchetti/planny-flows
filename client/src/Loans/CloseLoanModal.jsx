import React, { useEffect, useRef, useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';

import { amountWithCurrency, formatLoanNumber } from './money';

/* eslint-disable react/require-default-props */

const propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  /**
   * Called with `({ close, mode })` when the user confirms.
   * `close` must be called to close the modal.
   * `mode` is either 'close' or 'condone'.
   */
  onConfirm: PropTypes.func.isRequired,
  loan: PropTypes.shape({
    amount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    pendingBalance: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    borrower: PropTypes.shape({
      firstName: PropTypes.string,
      lastName: PropTypes.string,
    }),
    currency: PropTypes.string,
    number: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }),
  /** Preselect the mode: 'close' | 'condone'. Defaults to 'close' when balance is 0, else 'condone'. */
  defaultMode: PropTypes.oneOf(['close', 'condone']),
};

/**
 * Parse a raw loan balance into a number, treating null/undefined as 0.
 */
const toBalance = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
};

function FocusTrap({ containerRef, isActive, children }) {
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key !== 'Tab' || !containerRef.current || !isActive) return;
      const focusables = containerRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [containerRef, isActive],
  );

  useEffect(() => {
    if (!isActive) return;
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, isActive, handleKeyDown]);

  return children;
}

FocusTrap.propTypes = {
  containerRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  isActive: PropTypes.bool.isRequired,
  children: PropTypes.node.isRequired,
};

const borrowerName = (loan) => {
  if (!loan || !loan.borrower) return '—';
  return `${loan.borrower.firstName || ''} ${loan.borrower.lastName || ''}`.trim() || '—';
};

const CloseLoanModal = ({
  isOpen,
  onClose,
  onConfirm,
  loan = null,
  defaultMode: rawDefaultMode,
}) => {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [mode, setMode] = useState('close');
  const [isSubmitting, setSubmitting] = useState(false);

  const balance = toBalance(loan?.pendingBalance);
  const isZeroBalance = balance <= 0;
  const defaultMode = rawDefaultMode || (isZeroBalance ? 'close' : 'condone');

  // Reset mode when loan changes
  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode, loan?.id]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const focusable = modalRef.current.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable) focusable.focus();
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleEscape = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  const handleConfirm = useCallback(() => {
    setSubmitting(true);
    onConfirm({
      close: () => {
        setSubmitting(false);
        onClose();
      },
      mode,
    });
  }, [onConfirm, onClose, mode]);

  if (!isOpen || !loan) return null;

  const loanNumber = formatLoanNumber(loan.number);
  const balanceStr = amountWithCurrency(loan.pendingBalance, loan.currency);
  const name = borrowerName(loan);

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-space-md"
      onKeyDown={handleEscape}
    >
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="absolute inset-0 bg-[#111827]/60 backdrop-blur-sm"
        onClick={handleBackdropClick}
      />

      {/* Modal container */}
      <FocusTrap containerRef={modalRef} isActive={isOpen}>
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={mode === 'close' ? 'Cerrar préstamo' : 'Condonar saldo'}
          tabIndex={-1}
          className="
            relative w-full max-w-lg
            bg-surface-container-lowest rounded-xl
            shadow-xl
            animate-[fadeIn_200ms_ease-out]
            flex flex-col overflow-hidden
          "
        >
          {/* Sticky header with gradient */}
          <div className="px-space-lg pt-space-lg pb-space-md bg-gradient-to-r from-[#f5f3ff] to-[#ede9fe]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className={`
                    w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-inner
                    ${
                      mode === 'condone'
                        ? 'bg-error-container text-error'
                        : 'bg-secondary-fixed text-secondary'
                    }
                  `}
                >
                  <span className="material-symbols-outlined text-[26px]">
                    {mode === 'condone' ? 'money_off' : 'check_circle'}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="font-overline text-overline uppercase tracking-wider text-outline">
                    {mode === 'close' ? 'Cierre de préstamo' : 'Condonación de deuda'}
                  </span>
                  <h2 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">
                    {mode === 'close' ? 'Cerrar préstamo' : 'Condonar saldo'}
                  </h2>
                  <span className="font-code-key text-code-key text-outline">Nº {loanNumber}</span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Cerrar ventana"
                className="
                  w-8 h-8 rounded-lg flex items-center justify-center
                  text-outline hover:text-on-surface hover:bg-surface-container-low
                  transition-colors shrink-0
                "
                onClick={onClose}
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          </div>

          {/* Loan summary card */}
          <div className="px-space-lg pt-space-md">
            <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-[17px]">person</span>
                  </div>
                  <span className="font-label-md text-label-md text-on-surface font-semibold">
                    {name}
                  </span>
                </div>
                <span
                  className={`
                    px-2 py-0.5 rounded-full font-code-key text-[11px] font-bold
                    ${isZeroBalance ? 'bg-tertiary-fixed text-on-tertiary-fixed-variant' : 'bg-error-container text-on-error-container'}
                  `}
                >
                  {isZeroBalance ? 'Saldo $0' : `Saldo: ${balanceStr}`}
                </span>
              </div>
              {/* Progress bar */}
              {!isZeroBalance && (
                <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
                  <div className="h-full bg-tertiary rounded-full" style={{ width: '72%' }} />
                </div>
              )}
            </div>
          </div>

          {/* Mode selection */}
          <div className="px-space-lg pt-space-md flex flex-col gap-space-sm">
            <span className="font-label-md text-label-md text-on-surface font-semibold">
              Seleccioná la modalidad:
            </span>

            {/* Option 1: Close (balance $0) */}
            <button
              type="button"
              className={`
                w-full text-left rounded-xl p-space-md flex items-start gap-space-sm
                transition-all cursor-pointer
                ${
                  mode === 'close'
                    ? 'bg-surface-container-lowest ring-2 ring-primary shadow-sm'
                    : 'bg-surface-container-low hover:bg-surface-container-high/60'
                }
              `}
              onClick={() => setMode('close')}
            >
              <input
                type="radio"
                name="loan-resolution"
                checked={mode === 'close'}
                onChange={() => setMode('close')}
                className="mt-1 w-4 h-4 text-primary accent-primary cursor-pointer shrink-0"
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-label-lg text-label-lg text-on-surface font-semibold">
                  Cerrar (saldo $0)
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {isZeroBalance
                    ? 'El préstamo no tiene saldo pendiente. Se cerrará sin condonaciones.'
                    : `El préstamo quedará cerrado con el saldo actual de ${balanceStr}.`}
                </p>
              </div>
            </button>

            {/* Option 2: Condonar */}
            <button
              type="button"
              className={`
                w-full text-left rounded-xl p-space-md flex items-start gap-space-sm
                transition-all cursor-pointer
                ${
                  mode === 'condone'
                    ? 'bg-surface-container-lowest ring-2 ring-error shadow-sm'
                    : 'bg-surface-container-low hover:bg-surface-container-high/60'
                }
              `}
              onClick={() => setMode('condone')}
            >
              <input
                type="radio"
                name="loan-resolution"
                checked={mode === 'condone'}
                onChange={() => setMode('condone')}
                className="mt-1 w-4 h-4 text-error accent-error cursor-pointer shrink-0"
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-label-lg text-label-lg text-on-surface font-semibold">
                  Condonar saldo
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Perdonar el saldo remanente. El monto se registrará como pérdida contable y no
                  podrá recuperarse.
                </p>
              </div>
            </button>
          </div>

          {/* Warning banner for condone mode */}
          {mode === 'condone' && (
            <div className="px-space-lg pt-space-md">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-space-md flex items-start gap-space-sm">
                <span className="material-symbols-outlined text-[20px] text-amber-600 shrink-0 mt-0.5">
                  warning
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-label-md text-label-md text-amber-800 font-semibold">
                    Estás a punto de condonar {balanceStr}
                  </span>
                  <p className="font-body-sm text-body-sm text-amber-700">
                    Este monto se registrará como pérdida y no se podrá recuperar.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-space-lg py-space-md mt-space-sm bg-surface-container flex items-center justify-between gap-space-sm">
            <button
              type="button"
              className="
                h-10 px-5 rounded-xl
                bg-surface-container-lowest text-on-surface font-label-lg
                hover:bg-surface-container-high transition-colors
              "
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              className={`
                h-10 px-6 rounded-xl font-label-lg font-semibold shadow-sm
                transition-all flex items-center gap-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${
                  mode === 'condone'
                    ? 'bg-error hover:bg-[#93000a] text-on-error'
                    : 'bg-primary hover:bg-primary-container text-on-primary'
                }
              `}
              onClick={handleConfirm}
            >
              {isSubmitting && (
                <span className="material-symbols-outlined text-[18px] animate-spin">
                  progress_activity
                </span>
              )}
              {mode === 'condone' ? 'Condonar saldo' : 'Cerrar préstamo'}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>,
    document.getElementById('root') || document.body,
  );
};

CloseLoanModal.propTypes = propTypes;

export default CloseLoanModal;
