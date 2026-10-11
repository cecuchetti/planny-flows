import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { PageLoader } from 'shared/components';

import { loanCopy } from './copy';
import { Page, PageHeader, PageSubtitle, PageTitle } from './Styles';

/*
 * Préstamos renders inside the project shell — the host sidebar, the page header
 * and the project's content width. The host sidebar is the navigation: this view
 * has no second one of its own, so reaching Personas or a new loan is done the
 * same way the project reaches its other views, or from the list itself.
 */
const LoansList = lazy(() => import('./LoansList'));
const Borrowers = lazy(() => import('./Borrowers'));
const LoanForm = lazy(() => import('./LoanForm'));
const ReceiptFlow = lazy(() => import('./ReceiptFlow'));

function Loans() {
  return (
    <Page>
      <PageHeader>
        <PageTitle>{loanCopy.title}</PageTitle>
        <PageSubtitle>{loanCopy.subtitle}</PageSubtitle>
      </PageHeader>

      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/*
           * `/project/loans` and every unknown child fall back to the list: an
           * unknown path inside a hosted view is not a new page, and this keeps
           * the removed dashboard/receipt placeholders from 404-ing.
           */}
          <Route index element={<LoansList />} />
          <Route path="borrowers" element={<Borrowers />} />
          <Route path="new-loan" element={<LoanForm />} />
          <Route path="new-loan/:loanId" element={<LoanForm />} />
          <Route path="receipt" element={<ReceiptFlow />} />
          <Route path="*" element={<Navigate to="/project/loans" replace />} />
        </Routes>
      </Suspense>
    </Page>
  );
}

export default Loans;
