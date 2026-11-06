/* eslint-disable react/require-default-props */
import React, { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Button from 'shared/components/Button';
import PageLoader from 'shared/components/PageLoader';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';

import Receipt from '../Receipt';
import { borrowerFullName } from '../Receipt/receiptData';
import { receiptFlowCopy } from '../copy';
import { amountWithCurrency, formatEsAr, formatLoanNumber, toAmount } from '../money';
import { ErrorText, FieldErrorText } from '../Styles';

/** The editable default: min(installment, balance) when set, else the balance. */
const prefillAmount = (loan) => {
  const balance = toAmount(loan.pendingBalance) || 0;
  const installment = toAmount(loan.installmentAmount);
  if (installment !== null && installment !== undefined && installment > 0) {
    return String(Math.min(installment, balance).toFixed(2));
  }
  return String(balance.toFixed(2));
};

/**
 * Format a numeric string as es-AR locale (e.g. "8.000,00").
 * The input is the raw stored value like "8000.00".
 */
const formatAmountDisplay = (rawValue) => {
  if (!rawValue) return '';
  const parts = rawValue.split('.');
  const integerPart = parseInt(parts[0], 10);
  if (Number.isNaN(integerPart)) return rawValue;
  const decimals = parts.length > 1 ? parts[1].padEnd(2, '0').slice(0, 2) : '00';
  return `${integerPart.toLocaleString('es-AR')},${decimals}`;
};

/**
 * Parse an es-AR formatted string back to a raw numeric string.
 * "8.000,00" → "8000.00"
 */
const parseAmountInput = (text) => {
  // Remove dots (thousands separators in es-AR), replace comma with dot
  const normalized = text.replace(/\./g, '').replace(',', '.');
  // Only allow digits and one dot
  const cleaned = normalized.replace(/[^0-9.]/g, '');
  // Prevent multiple dots
  const dotIndex = cleaned.indexOf('.');
  const final = dotIndex >= 0
    ? cleaned.slice(0, dotIndex + 1) + cleaned.slice(dotIndex + 1).replace(/\./g, '')
    : cleaned;
  return final;
};

/** Two-letter initials for the avatar circle. */
const borrowerInitials = (loan) => {
  const { borrower } = loan;
  if (!borrower) return '—';
  return `${(borrower.firstName || '')[0] || ''}${(borrower.lastName || '')[0] || ''}`.toUpperCase();
};

/** Default concept string derived from the loan. */
const defaultConcept = (loan) => {
  if (!loan) return '';
  const paid = loan.installmentsPaid || 0;
  const total = loan.installmentsCount || 0;
  return `${loan.concept || ''} · Cuota ${paid + 1}/${total}`;
};

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

  // New form state
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [concept, setConcept] = useState('');
  const [method, setMethod] = useState('Transferencia');
  const [notify, setNotify] = useState(true);

  // Dropdown open state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

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

  const [searchParams] = useSearchParams();
  const preselectId = searchParams.get('loan');

  // Auto-select a loan from the ?loan= query param.
  // Only fires once: when loans are loaded and no selection has been made yet.
  useEffect(() => {
    if (!preselectId || selectedId !== null || activeLoans.length === 0) return;
    const target = activeLoans.find((l) => String(l.id) === String(preselectId));
    if (target) {
      setSelectedId(target.id);
      setAmount(prefillAmount(target));
      setConcept(defaultConcept(target));
    }
  }, [activeLoans, preselectId, selectedId]);

  const selectedLoan = activeLoans.find((loan) => loan.id === selectedId) || null;

  // Derive previewNumber when a loan is selected
  const previewNumber = selectedLoan
    ? `${formatLoanNumber(selectedLoan.number)}-${String(
        (selectedLoan.installmentsPaid || 0) + 1,
      ).padStart(3, '0')}`
    : '';

  const handleSelect = (id) => {
    const loan = activeLoans.find((item) => item.id === id) || null;
    setSelectedId(id);
    setReceipt(null);
    setAmountError(null);
    setAmount(loan ? prefillAmount(loan) : '');
    if (loan) {
      setConcept(defaultConcept(loan));
    }
    setDropdownOpen(false);
  };

  const retry = () => {
    setLoadError(null);
    setLoading(true);
    load()
      .catch(() => setLoadError(receiptFlowCopy.loadError))
      .finally(() => setLoading(false));
  };

  const resetForm = () => {
    setAmount(selectedLoan ? prefillAmount(selectedLoan) : '');
    setReference('');
    setDate(new Date().toISOString().slice(0, 10));
    if (selectedLoan) {
      setConcept(defaultConcept(selectedLoan));
    } else {
      setConcept('');
    }
    setMethod('Transferencia');
    setNotify(true);
    setReceipt(null);
    setAmountError(null);
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
    // Include date; PaymentRequest has extra="ignore" so it's safely dropped if unsupported
    api
      .post(`/api/v1/loans/${selectedLoan.id}/payments`, { amount, date })
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
              setReference('');
              setConcept('');
            }
          });
      })
      .catch((error) => toast.error(error))
      .finally(() => setPaying(false));
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-space-md py-space-lg">
        <div role="alert" className="flex flex-col items-center gap-space-sm">
          <ErrorText>{loadError}</ErrorText>
          <Button type="button" onClick={retry}>
            {receiptFlowCopy.retry}
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) return <PageLoader />;

  // Borrower name for tip & phone placeholder
  const borrowerName = selectedLoan ? borrowerFullName(selectedLoan) : '';
  const borrowerInitial = selectedLoan && selectedLoan.borrower
    ? (selectedLoan.borrower.firstName || '')[0] || ''
    : '';

  return (
    <div className="flex flex-col gap-space-lg">
      {/* Page Header (breadcrumb removed — Loans shell already renders it) */}
      <div className="flex flex-col gap-1">
        {/* Title + emission badge + subtitle + top stats */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md mt-1">
          <div>
            <div className="flex items-center gap-space-sm">
              <h1 className="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">
                {receiptFlowCopy.title}
              </h1>
              {selectedLoan ? (
                <span className="bg-primary/10 text-primary font-label-md text-label-md px-2.5 py-0.5 rounded-full flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {`Emisión Nº ${previewNumber}`}
                </span>
              ) : (
                <span className="bg-primary/10 text-primary font-label-md text-label-md px-2.5 py-0.5 rounded-full flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {receiptFlowCopy.selectLabel}
                </span>
              )}
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
              Registrá un cobro de cuota y emití el comprobante formal imprimible para la persona prestataria.
            </p>
          </div>

          {/* Top stats badge */}
          {selectedLoan && (
            <div className="flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-xs rounded-xl">
              <div className="flex flex-col text-right">
                <span className="font-overline text-overline text-outline uppercase tracking-wider">
                  Acuerdo Activo
                </span>
                <span className="font-code-key text-code-key text-on-surface font-semibold">
                  {`PRÉSTAMO-VIS-${formatLoanNumber(selectedLoan.number)}`}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {activeLoans.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm p-space-xl flex flex-col items-center justify-center text-center gap-space-sm">
          <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-outline">
            <span className="material-symbols-outlined text-[24px]">account_balance</span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">{receiptFlowCopy.empty}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
          {/* LEFT COLUMN: Interactive Form Card */}
          <div className="xl:col-span-5 flex flex-col gap-space-md">
            <div className="bg-surface-container-lowest rounded-2xl shadow-sm p-space-lg flex flex-col gap-space-md">
              {/* Form header */}
              <div className="flex items-center justify-between pb-space-sm">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">edit_document</span>
                  </span>
                  <h2 className="font-headline-md text-headline-md text-on-surface">Datos del Cobro</h2>
                </div>
                {/* Validado badge — only when a loan is selected (spec #4) */}
                {selectedLoan && (
                  <span className="bg-tertiary/10 text-tertiary font-label-md text-label-md px-2.5 py-1 rounded-md flex items-center gap-1 font-semibold">
                    <span className="material-symbols-outlined text-[14px]">check</span>
                    {' Validado'}
                  </span>
                )}
              </div>

              {/* Loan Selector Card (spec #3) — replaces the plain Select */}
              <div className="flex flex-col gap-1.5" data-testid="form-field:receiptLoan">
                <label className="font-label-md text-label-md text-on-surface-variant font-medium" htmlFor="receipt-loan">
                  {receiptFlowCopy.selectLabel} *
                </label>

                <div className="relative" ref={dropdownRef}>
                  {!selectedLoan ? (
                    /* Unselected state: muted card with unfold_more */
                    <button
                      type="button"
                      className="bg-surface-container-low p-space-sm rounded-xl w-full flex items-center justify-between cursor-pointer hover:bg-surface-container transition-colors"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                    >
                      <span className="font-body-md text-body-md text-on-surface-variant">
                        Elegí un préstamo activo
                      </span>
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                        unfold_more
                      </span>
                    </button>
                  ) : (
                    /* Selected state: spec card */
                    <div>
                      <div className="bg-surface-container-low p-space-sm rounded-xl w-full flex items-center justify-between cursor-pointer hover:bg-surface-container transition-colors">
                        <div className="flex items-center gap-space-sm">
                          <div className="w-10 h-10 rounded-full bg-secondary text-on-secondary flex items-center justify-center font-bold shadow-xs">
                            {borrowerInitials(selectedLoan)}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-label-lg text-label-lg font-bold text-on-surface">
                                {borrowerName}
                              </span>
                              <span className="font-overline text-overline px-1.5 py-0.2 bg-surface-container-high rounded text-on-surface-variant">
                                {`MUTUO #${formatLoanNumber(selectedLoan.number)}`}
                              </span>
                            </div>
                            <span className="font-code-key text-code-key text-on-surface-variant truncate">
                              {`Total: $ ${formatEsAr(selectedLoan.amount)} ${selectedLoan.currency} · `}
                              <strong className="text-error">
                                {`Resta: $ ${formatEsAr(selectedLoan.pendingBalance)}`}
                              </strong>
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="w-7 h-7 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors"
                          title="Cambiar préstamo"
                          onClick={() => setDropdownOpen(!dropdownOpen)}
                        >
                          <span className="material-symbols-outlined text-[18px]">unfold_more</span>
                        </button>
                      </div>

                      {/* Cuota pactada / Cuotas pagadas row */}
                      <div className="flex justify-between px-1 text-body-sm mt-2">
                        <span className="text-on-surface-variant">
                          Cuota pactada:{' '}
                          <span className="font-code-key font-semibold text-on-surface">
                            ${formatEsAr(selectedLoan.installmentAmount)} {selectedLoan.currency}
                          </span>
                        </span>
                        <span className="font-semibold text-primary">
                          {`Cuotas pagadas: ${selectedLoan.installmentsPaid || 0} / ${selectedLoan.installmentsCount || 0}`}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Dropdown for selecting a loan */}
                  {dropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-surface-container-lowest rounded-xl shadow-lg border border-surface-container-high overflow-hidden">
                      {activeLoans.map((loan) => {
                        const loanBorrowerName = borrowerFullName(loan);
                        return (
                          <button
                            key={loan.id}
                            type="button"
                            className={`w-full flex items-center gap-space-sm px-space-sm py-2.5 hover:bg-surface-container transition-colors text-left ${
                              loan.id === selectedId ? 'bg-primary/5' : ''
                            }`}
                            onClick={() => handleSelect(loan.id)}
                          >
                            <div className="w-10 h-10 rounded-full bg-secondary text-on-secondary flex items-center justify-center font-bold text-sm shrink-0">
                              {borrowerInitials(loan)}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-label-md text-label-md font-bold text-on-surface">
                                  {loanBorrowerName}
                                </span>
                                <span className="font-overline text-overline text-on-surface-variant">
                                  {`Nº ${formatLoanNumber(loan.number)}`}
                                </span>
                              </div>
                              <span className="font-code-key text-code-key text-on-surface-variant">
                                {`Total: $ ${formatEsAr(loan.amount)} ${loan.currency} · Resta: $ ${formatEsAr(loan.pendingBalance)}`}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick amount chips (only shown when loan is selected) */}
              {selectedLoan && (
                <Fragment>
                  <div className="flex flex-col gap-1.5">
                    <span className="font-overline text-overline text-outline uppercase tracking-wider">
                      Atajos de importe rápido
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        className="px-2 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-center transition-colors"
                        onClick={() => {
                          const partial = toAmount(selectedLoan.pendingBalance)
                            ? String(Math.round(toAmount(selectedLoan.pendingBalance) * 0.3).toFixed(2))
                            : '0.00';
                          setAmount(partial);
                        }}
                      >
                        <div className="font-body-sm text-body-sm font-bold">Pago parcial</div>
                        <div className="font-code-key text-code-key text-primary">
                          {selectedLoan.pendingBalance
                            ? `$ ${formatEsAr(Math.round(toAmount(selectedLoan.pendingBalance) * 0.3).toFixed(2))}`
                            : '$ 0,00'}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-center transition-colors"
                        onClick={() => {
                          const installment = toAmount(selectedLoan.installmentAmount);
                          setAmount(installment ? String(installment.toFixed(2)) : prefillAmount(selectedLoan));
                        }}
                      >
                        <div className="font-body-sm text-body-sm font-bold">Cuota sugerida</div>
                        <div className="font-code-key text-code-key text-on-surface-variant">
                          {selectedLoan.installmentAmount
                            ? `$ ${formatEsAr(selectedLoan.installmentAmount)}`
                            : '—'}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-center transition-colors"
                        onClick={() => {
                          const balance = toAmount(selectedLoan.pendingBalance);
                          setAmount(balance ? String(balance.toFixed(2)) : '0.00');
                        }}
                      >
                        <div className="font-body-sm text-body-sm font-bold">Liquidar saldo</div>
                        <div className="font-code-key text-code-key text-tertiary">
                          {selectedLoan.pendingBalance
                            ? `$ ${formatEsAr(selectedLoan.pendingBalance)}`
                            : '$ 0,00'}
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Amount input — native, with formatting (spec #5) */}
                  <div className="flex flex-col gap-1.5" data-testid="form-field:receiptAmount">
                    <div className="flex items-center justify-between">
                      <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="receipt-amount">
                        {receiptFlowCopy.amount} *
                      </label>
                      <span className="font-body-sm text-body-sm text-tertiary flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[13px]">payments</span>
                        {`Moneda nacional (${selectedLoan.currency || 'ARS'})`}
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <span className="absolute left-3.5 font-code-key text-headline-md font-bold text-outline">$</span>
                      <input
                        id="receipt-amount"
                        name="receiptAmount"
                        type="text"
                        inputMode="decimal"
                        value={formatAmountDisplay(amount)}
                        onChange={(e) => {
                          const parsed = parseAmountInput(e.target.value);
                          setAmount(parsed);
                        }}
                        placeholder="0,00"
                        className="w-full h-12 pl-8 pr-16 bg-surface-container-low rounded-xl font-code-key text-headline-md text-on-surface font-bold focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                      />
                      <span className="absolute right-3.5 font-code-key text-code-key font-bold text-outline">
                        {selectedLoan.currency || 'ARS'}
                      </span>
                    </div>
                  </div>

                  {/* Payment method (spec #9) */}
                  <div className="flex flex-col gap-1.5">
                    <span className="font-label-md text-label-md text-on-surface-variant font-medium">
                      Medio de pago / Instrumento *
                    </span>
                    <div className="grid grid-cols-3 p-1 bg-surface-container rounded-xl gap-1">
                      {['Transferencia', 'Efectivo', 'Mercado Pago'].map((m) => {
                        const icons = {
                          Transferencia: 'account_balance',
                          Efectivo: 'payments',
                          'Mercado Pago': 'smartphone',
                        };
                        const isSelected = method === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            className={`py-1.5 rounded-lg font-label-md text-label-md text-center transition-all flex items-center justify-center gap-1 ${
                              isSelected
                                ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-xs'
                                : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                            onClick={() => setMethod(m)}
                          >
                            <span className="material-symbols-outlined text-[15px]">{icons[m]}</span>
                            <span>{m}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Reference & Date in 2-col grid (spec #6 & #7) */}
                  <div className="grid grid-cols-2 gap-space-sm">
                    <div className="flex flex-col gap-1.5">
                      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                      <label className="font-label-md text-label-md text-on-surface-variant font-medium" htmlFor="receipt-reference">
                        Nº Ref. / Comprobante
                      </label>
                      <div className="relative flex items-center">
                        <input
                          id="receipt-reference"
                          type="text"
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                          className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-code-key text-code-key text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                      <label className="font-label-md text-label-md text-on-surface-variant font-medium" htmlFor="receipt-date">
                        Fecha del pago *
                      </label>
                      <div className="relative flex items-center">
                        <input
                          id="receipt-date"
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Concepto (spec #8) — single-line input */}
                  <div className="flex flex-col gap-1.5">
                    {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                    <label className="font-label-md text-label-md text-on-surface-variant font-medium" htmlFor="receipt-concept">
                      Concepto descriptivo para el comprobante
                    </label>
                    <input
                      id="receipt-concept"
                      type="text"
                      value={concept}
                      onChange={(e) => setConcept(e.target.value)}
                      className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                    />
                  </div>
                </Fragment>
              )}

              {amountError && (
                <FieldErrorText role="alert">{amountError}</FieldErrorText>
              )}

              {/* WhatsApp toggle row (spec #10) — only when loan selected */}
              {selectedLoan && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low/70">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-tertiary/10 text-tertiary flex items-center justify-center">
                      <span className="material-symbols-outlined text-[17px]">send</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface font-medium">
                        Notificación automática por WhatsApp
                      </span>
                      <span className="font-body-sm text-body-sm text-outline">
                        {`+54 9 351 000-0000 (${borrowerInitial}.)`}
                      </span>
                    </div>
                  </div>
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={notify}
                      onChange={() => setNotify(!notify)}
                    />
                    <div className="w-10 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-tertiary" />
                  </label>
                </div>
              )}

              {/* Action Buttons */}
              {selectedLoan && (
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    className="w-full h-11 rounded-xl bg-primary-container hover:bg-primary text-on-primary-container hover:text-on-primary font-label-lg text-label-lg font-semibold flex items-center justify-center gap-2 shadow-sm transition-all duration-200 hover:shadow-md"
                    onClick={confirm}
                    disabled={isPaying}
                  >
                    <span className="material-symbols-outlined text-[20px]">assignment_turned_in</span>
                    <span>{isPaying ? receiptFlowCopy.confirming : receiptFlowCopy.confirm}</span>
                  </button>

                  {/* Clear form + Terminal ID row (spec #11) */}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      className="font-body-sm text-body-sm text-on-surface-variant hover:text-error transition-colors flex items-center gap-1 py-1 px-2"
                      onClick={resetForm}
                    >
                      <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                      <span>Limpiar formulario</span>
                    </button>
                    <span className="font-code-key text-body-sm text-outline">Terminal ID: VIS-COR-01</span>
                  </div>
                </div>
              )}
            </div>

            {/* Mini tip (spec #12) — dynamic text */}
            {selectedLoan && (
              <div className="bg-surface-container-low rounded-2xl p-space-md flex items-start gap-space-sm">
                <span className="text-secondary font-headline-lg text-[22px]">💡</span>
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface font-semibold">
                    ¿Sabías que podés exportar el libro mayor?
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    {(() => {
                      const parsedAmount = toAmount(amount) || 0;
                      const balance = toAmount(selectedLoan.pendingBalance) || 0;
                      const restante = Math.max(balance - parsedAmount, 0);
                      return `Si registrás este pago de $${formatAmountDisplay(String(parsedAmount.toFixed(2)))}, a ${borrowerName} le restará saldar exactamente $${formatAmountDisplay(String(restante.toFixed(2)))} en su última cuota pautada.`;
                    })()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Receipt preview (spec Output Contract) */}
          <div className="xl:col-span-7 flex flex-col gap-space-md">
            <Receipt
              previewLoan={selectedLoan}
              previewDraft={selectedLoan ? { amount, reference, date, concept, method, notify, number: previewNumber } : null}
              payment={receipt?.payment}
              loan={receipt?.loan}
              withActions
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default ReceiptFlow;
