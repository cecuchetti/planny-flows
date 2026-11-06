import React, { Fragment, useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';

import Button from 'shared/components/Button';
import PageLoader from 'shared/components/PageLoader';
import api from 'shared/utils/api';

import { dashboardCopy } from '../copy';
import { amountWithCurrency, formatDate, formatLoanNumber } from '../money';
import { EmptyState, ErrorText, Section } from '../Styles';

/** The recovery ratio is a two-decimal string like `"0.50"`; show it as a percent. */
const recoveryRateText = (rate) => `${Math.round(Number(rate) * 100)}%`;

/** Inline SVG icon components to avoid external font dependencies. */

function WalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ArrowForwardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function CurrencyCardView({ currency }) {
  const [activeCurrency, setActiveCurrency] = useState(currency.currency);

  return (
    <article className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-md">
      {/* Card Header & Currency Switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
          <span className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary">
            <WalletIcon />
          </span>
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface leading-tight">Resumen consolidado</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Posición total de recuperos y colocación activa</p>
          </div>
        </div>
        <div className="flex items-center bg-surface-container-low p-1 rounded-lg gap-1">
          <button
            type="button"
            className={`px-2.5 py-1 rounded-md font-code-key text-code-key font-bold shadow-xs transition-colors ${
              activeCurrency === 'ARS'
                ? 'bg-secondary-fixed text-secondary'
                : 'text-on-surface-variant hover:text-on-surface font-medium'
            }`}
            onClick={() => setActiveCurrency('ARS')}
          >
            ARS
          </button>
          <button
            type="button"
            className={`px-2.5 py-1 rounded-md font-code-key text-code-key transition-colors ${
              activeCurrency === 'USD'
                ? 'bg-secondary-fixed text-secondary font-bold shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface font-medium'
            }`}
            onClick={() => setActiveCurrency('USD')}
          >
            USD
          </button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-surface-container-low p-space-md rounded-xl">
        <div className="bg-surface-container-lowest p-space-sm rounded-lg space-y-0.5 shadow-xs">
          <span className="font-overline text-overline uppercase tracking-wider text-outline">{dashboardCopy.principal}</span>
          <p className="font-code-key text-headline-md text-on-surface font-semibold">{amountWithCurrency(currency.principal, currency.currency)}</p>
        </div>
        <div className="bg-surface-container-lowest p-space-sm rounded-lg space-y-0.5 shadow-xs">
          <span className="font-overline text-overline uppercase tracking-wider text-outline">{dashboardCopy.collected}</span>
          <p className="font-code-key text-headline-md text-on-surface font-semibold">{amountWithCurrency(currency.collected, currency.currency)}</p>
        </div>
        <div className="bg-surface-container-lowest p-space-sm rounded-lg space-y-0.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="font-overline text-overline uppercase tracking-wider text-secondary font-bold">{dashboardCopy.outstanding}</span>
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          </div>
          <p className="font-code-key text-headline-md text-secondary font-bold">{amountWithCurrency(currency.outstanding, currency.currency)}</p>
        </div>
        <div className="bg-surface-container-lowest p-space-sm rounded-lg space-y-0.5 shadow-xs">
          <span className="font-overline text-overline uppercase tracking-wider text-outline">{dashboardCopy.writtenOff}</span>
          <p className="font-code-key text-headline-md text-on-surface-variant font-medium">{amountWithCurrency(currency.writtenOff, currency.currency)}</p>
        </div>
        <div className="bg-surface-container-lowest p-space-sm rounded-lg space-y-0.5 shadow-xs">
          <span className="font-overline text-overline uppercase tracking-wider text-outline">{dashboardCopy.recoveryRate}</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-tertiary-fixed/30 text-on-tertiary-fixed-variant font-code-key text-[11px] font-bold">{recoveryRateText(currency.recoveryRate)}</span>
            <span className="font-body-sm text-body-sm text-outline">al día</span>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-space-sm rounded-lg space-y-0.5 shadow-xs">
          <span className="font-overline text-overline uppercase tracking-wider text-outline">{dashboardCopy.averageOutstanding}</span>
          <p className="font-code-key text-body-md text-on-surface font-semibold">{amountWithCurrency(currency.averageOutstanding, currency.currency)}</p>
        </div>
        <div className="bg-surface-container-lowest p-space-sm rounded-lg space-y-0.5 shadow-xs">
          <span className="font-overline text-overline uppercase tracking-wider text-outline">{dashboardCopy.collectedThisMonth}</span>
          <p className="font-code-key text-body-md text-tertiary font-semibold">{amountWithCurrency(currency.collectedThisMonth, currency.currency)}</p>
        </div>
        <div className="bg-surface-container-lowest p-space-sm rounded-lg space-y-0.5 shadow-xs flex flex-col justify-center">
          <span className="font-overline text-overline uppercase tracking-wider text-outline">{dashboardCopy.activeCount}</span>
          <div className="flex items-center gap-2 text-body-sm font-label-md">
            <span className="text-on-surface font-semibold">{currency.activeCount} activos</span>
            <span className="text-outline">/</span>
            <span className="text-on-surface-variant">{currency.closedCount} cerrados</span>
          </div>
        </div>
      </div>
    </article>
  );
}

CurrencyCardView.propTypes = {
  currency: PropTypes.object.isRequired,
};

/*
 * Resumen: the default landing of Préstamos, and read-only by design. It shows
 * the per-currency portfolio cards plus the near-completion and recent-activity
 * lists, all from the single aggregated summary endpoint — nothing is computed
 * client-side, and currencies are never combined. It refetches on every entry so
 * the figures always match the ledger.
 */
function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(() => api.get('/api/v1/loans/summary').then(setSummary), []);

  useEffect(() => {
    setLoadError(null);
    setLoading(true);
    load()
      .catch(() => setLoadError(dashboardCopy.loadError))
      .finally(() => setLoading(false));
  }, [load]);

  const retry = () => {
    setLoadError(null);
    setLoading(true);
    load()
      .catch(() => setLoadError(dashboardCopy.loadError))
      .finally(() => setLoading(false));
  };

  const goToLoan = (loanId) => navigate(`/project/loans/new-loan/${loanId}`);

  if (loadError) {
    return (
      <Section>
        <div role="alert">
          <ErrorText>{loadError}</ErrorText>
          <Button type="button" onClick={retry}>
            {dashboardCopy.retry}
          </Button>
        </div>
      </Section>
    );
  }

  if (isLoading) return <PageLoader />;

  const currencies = summary?.currencies || [];
  const nearCompletion = summary?.nearCompletion || [];
  const recentPayments = summary?.recentPayments || [];
  const hasData = currencies.length > 0;

  return (
    <div className="p-space-lg space-y-space-lg">
      {/* Resumen consolidado card */}
      {!hasData ? (
        <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
          <EmptyState>{dashboardCopy.empty}</EmptyState>
        </section>
      ) : (
        <Fragment>
          {currencies.map((currency) => (
            <CurrencyCardView key={currency.currency} currency={currency} />
          ))}

          {/* Bottom Split: A punto de completarse + Actividad reciente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {/* A punto de completarse */}
            <div className="bg-surface-container-low/70 rounded-lg p-space-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-label-md text-label-md font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="text-secondary">
                    <FlagIcon />
                  </span>
                  {dashboardCopy.nearCompletionTitle}
                </span>
                <span className="font-body-sm text-body-sm text-outline">{nearCompletion.length} legajos</span>
              </div>
              {nearCompletion.length === 0 ? (
                <EmptyState>{dashboardCopy.nearCompletionEmpty}</EmptyState>
              ) : (
                <div className="space-y-1.5">
                  {nearCompletion.map((item) => (
                    <button
                      key={item.loanId}
                      type="button"
                      onClick={() => goToLoan(item.loanId)}
                      className="w-full p-2 rounded bg-surface-container-lowest hover:bg-surface-container transition-all flex items-center justify-between cursor-pointer group shadow-2xs text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-secondary-fixed text-on-secondary-fixed font-code-key text-[10px] font-bold flex items-center justify-center shrink-0">
                          {item.borrower.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-label-md text-label-md text-on-surface truncate">
                            {item.borrower} <span className="font-code-key text-[11px] text-outline">· Nº {formatLoanNumber(item.number)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-code-key text-body-sm font-semibold text-secondary">
                          {dashboardCopy.remaining} {amountWithCurrency(item.remainingBalance, item.currency)}
                        </span>
                        <span className="text-outline group-hover:translate-x-0.5 transition-transform">
                          <ArrowForwardIcon />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Actividad reciente */}
            <div className="bg-surface-container-low/70 rounded-lg p-space-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-label-md text-label-md font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="text-tertiary">
                    <HistoryIcon />
                  </span>
                  {dashboardCopy.recentActivityTitle}
                </span>
                <span className="font-body-sm text-body-sm text-outline">Últimos cobros</span>
              </div>
              {recentPayments.length === 0 ? (
                <EmptyState>{dashboardCopy.recentActivityEmpty}</EmptyState>
              ) : (
                <div className="space-y-1.5 font-body-sm text-body-sm">
                  {recentPayments.map((item) => (
                    <button
                      key={item.paymentId}
                      type="button"
                      onClick={() => goToLoan(item.loanId)}
                      className="w-full p-2 rounded bg-surface-container-lowest flex items-center justify-between shadow-2xs text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-code-key text-[11px] text-outline shrink-0">{formatDate(item.date)}</span>
                        <span className="text-on-surface truncate font-label-md">{item.borrower}</span>
                        <span className="font-code-key text-[10px] text-outline shrink-0">Nº {formatLoanNumber(item.loanNumber)}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 font-code-key text-tertiary font-semibold">
                        <span>{amountWithCurrency(item.amount, item.currency)}</span>
                        <span className="text-tertiary">
                          <CheckCircleIcon />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Fragment>
      )}
    </div>
  );
}

export default Dashboard;
