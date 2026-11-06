import React, { Fragment, Suspense, lazy } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { PageLoader } from 'shared/components';

import { loanCopy } from './copy';

/*
 * Préstamos renders inside the project shell — the host sidebar, the page header
 * and the project's content width. The host sidebar is the navigation: this view
 * has no second one of its own, so reaching Personas or a new loan is done the
 * same way the project reaches its other views, or from the list itself.
 */
const Dashboard = lazy(() => import('./Dashboard'));
const LoansList = lazy(() => import('./LoansList'));
const Borrowers = lazy(() => import('./Borrowers'));
const LoanForm = lazy(() => import('./LoanForm'));
const ReceiptFlow = lazy(() => import('./ReceiptFlow'));

/*
 * The Préstamos landing: the portfolio summary on top, the loan list below it.
 * Both are the views the two former sidebar entries rendered — the page stacks
 * them, so neither component changed. The summary is what loads first, so the
 * operator sees the figures before the ledger.
 */
function LoansOverview() {
  return (
    <Fragment>
      <Dashboard />
      <LoansList />
    </Fragment>
  );
}

/** Child route title lookup for breadcrumb */
const CHILD_TITLES = {
  borrowers: 'Personas',
  'new-loan': 'Nuevo préstamo',
  receipt: 'Generar recibo',
};

function Loans() {
  const location = useLocation();
  const pathParts = location.pathname.replace(/^\/project\/loans\/?/, '').split('/');
  const isIndex = pathParts[0] === '';
  const childTitle = !isIndex ? CHILD_TITLES[pathParts[0]] || null : null;

  return (
    <div className="flex flex-col gap-space-lg">
      {/* Breadcrumb — 4 levels for child routes */}
      <nav className="flex items-center gap-1.5 text-outline text-body-sm font-body-sm">
        <Link to="/project" className="hover:text-primary transition-colors">
          Proyectos
        </Link>
        <span className="text-[10px]">/</span>
        <Link to="/project" className="hover:text-primary transition-colors">
          VIS — Internal Platform
        </Link>
        <span className="text-[10px]">/</span>
        {childTitle ? (
          <Fragment>
            <Link to="/project/loans" className="hover:text-primary transition-colors">
              Préstamos
            </Link>
            <span className="text-[10px]">/</span>
            <span className="text-on-surface font-label-md">{childTitle}</span>
          </Fragment>
        ) : (
          <span className="text-on-surface font-label-md">Préstamos</span>
        )}
      </nav>

      {/* Page header: title + subtitle — only on index route */}
      {isIndex && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          <div className="space-y-1">
            <div className="flex items-baseline gap-space-sm">
              <h1 className="font-headline-lg text-headline-lg text-on-surface">{loanCopy.title}</h1>
              <span className="font-body-md text-body-md text-on-surface-variant">
                {loanCopy.subtitle}
              </span>
            </div>
          </div>
          {/* Top action buttons area — child components (Dashboard, LoansList) add their own buttons */}
          <div className="flex items-center gap-space-sm shrink-0" />
        </div>
      )}

      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/*
           * `/project/loans` is the whole page: the summary at the top and the
           * list below. `/loans/loans` — where the list used to live when the
           * summary had its own entry — redirects here so older links and
           * bookmarks keep working, as does every unknown child.
           */}
          <Route index element={<LoansOverview />} />
          <Route path="loans" element={<Navigate to="/project/loans" replace />} />
          <Route path="borrowers" element={<Borrowers />} />
          <Route path="new-loan" element={<LoanForm />} />
          <Route path="new-loan/:loanId" element={<LoanForm />} />
          <Route path="receipt" element={<ReceiptFlow />} />
          <Route path="*" element={<Navigate to="/project/loans" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default Loans;
