import React, { Fragment, useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';

import Button from 'shared/components/Button';
import PageLoader from 'shared/components/PageLoader';
import api from 'shared/utils/api';

import { dashboardCopy } from '../copy';
import { amountWithCurrency, formatDate, formatLoanNumber } from '../money';
import { CardTitle, Chip, EmptyState, ErrorText, List, ListRow, Section } from '../Styles';
import {
  CurrencyCard,
  CurrencyGrid,
  CurrencyHeader,
  MetricLabel,
  MetricLine,
  MetricValue,
  ReferenceButton,
  Subtitle,
} from './Styles';

/** The recovery ratio is a two-decimal string like `"0.50"`; show it as a percent. */
const recoveryRateText = (rate) => `${Math.round(Number(rate) * 100)}%`;

function CurrencyCardView({ currency }) {
  return (
    <CurrencyCard>
      <CurrencyHeader>
        <Chip>{currency.currency}</Chip>
      </CurrencyHeader>

      <MetricLine>
        <MetricLabel>{dashboardCopy.principal}</MetricLabel>
        <MetricValue>{amountWithCurrency(currency.principal, currency.currency)}</MetricValue>
      </MetricLine>
      <MetricLine>
        <MetricLabel>{dashboardCopy.collected}</MetricLabel>
        <MetricValue>{amountWithCurrency(currency.collected, currency.currency)}</MetricValue>
      </MetricLine>
      <MetricLine>
        <MetricLabel>{dashboardCopy.outstanding}</MetricLabel>
        <MetricValue>{amountWithCurrency(currency.outstanding, currency.currency)}</MetricValue>
      </MetricLine>
      <MetricLine>
        <MetricLabel>{dashboardCopy.writtenOff}</MetricLabel>
        <MetricValue>{amountWithCurrency(currency.writtenOff, currency.currency)}</MetricValue>
      </MetricLine>
      <MetricLine>
        <MetricLabel>{dashboardCopy.recoveryRate}</MetricLabel>
        <MetricValue>{recoveryRateText(currency.recoveryRate)}</MetricValue>
      </MetricLine>
      <MetricLine>
        <MetricLabel>{dashboardCopy.averageOutstanding}</MetricLabel>
        <MetricValue>
          {amountWithCurrency(currency.averageOutstanding, currency.currency)}
        </MetricValue>
      </MetricLine>
      <MetricLine>
        <MetricLabel>{dashboardCopy.collectedThisMonth}</MetricLabel>
        <MetricValue>
          {amountWithCurrency(currency.collectedThisMonth, currency.currency)}
        </MetricValue>
      </MetricLine>
      <MetricLine>
        <MetricLabel>{dashboardCopy.activeCount}</MetricLabel>
        <MetricValue>{currency.activeCount}</MetricValue>
      </MetricLine>
      <MetricLine>
        <MetricLabel>{dashboardCopy.closedCount}</MetricLabel>
        <MetricValue>{currency.closedCount}</MetricValue>
      </MetricLine>
    </CurrencyCard>
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
    <Section>
      <CardTitle>{dashboardCopy.title}</CardTitle>

      {!hasData ? (
        <EmptyState>{dashboardCopy.empty}</EmptyState>
      ) : (
        <Fragment>
          <CurrencyGrid>
            {currencies.map((currency) => (
              <CurrencyCardView key={currency.currency} currency={currency} />
            ))}
          </CurrencyGrid>

          <Subtitle>{dashboardCopy.nearCompletionTitle}</Subtitle>
          {nearCompletion.length === 0 ? (
            <EmptyState>{dashboardCopy.nearCompletionEmpty}</EmptyState>
          ) : (
            <List>
              {nearCompletion.map((item) => (
                <ListRow key={item.loanId}>
                  <ReferenceButton type="button" onClick={() => goToLoan(item.loanId)}>
                    {item.borrower} · Nº {formatLoanNumber(item.number)} · {dashboardCopy.remaining}{' '}
                    {amountWithCurrency(item.remainingBalance, item.currency)}
                  </ReferenceButton>
                </ListRow>
              ))}
            </List>
          )}

          <Subtitle>{dashboardCopy.recentActivityTitle}</Subtitle>
          {recentPayments.length === 0 ? (
            <EmptyState>{dashboardCopy.recentActivityEmpty}</EmptyState>
          ) : (
            <List>
              {recentPayments.map((item) => (
                <ListRow key={item.paymentId}>
                  <ReferenceButton type="button" onClick={() => goToLoan(item.loanId)}>
                    {formatDate(item.date)} · {item.borrower} · Nº{' '}
                    {formatLoanNumber(item.loanNumber)} ·{' '}
                    {amountWithCurrency(item.amount, item.currency)}
                  </ReferenceButton>
                </ListRow>
              ))}
            </List>
          )}
        </Fragment>
      )}
    </Section>
  );
}

export default Dashboard;
