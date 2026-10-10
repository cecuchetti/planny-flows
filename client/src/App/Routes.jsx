import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import { navigationRef } from 'shared/utils/navigationRef';
import { LOANS_ENABLED } from 'shared/utils/loansFlag';
import PageLoader from 'shared/components/PageLoader';

const Project = lazy(() => import('Project'));
const Authenticate = lazy(() => import('Auth/Authenticate'));
const PageError = lazy(() => import('shared/components/PageError'));

/*
 * Loans is not an app of its own: it is one more view inside the project shell,
 * registered as a child route of `/project` (see `Project/index.jsx`). That is
 * what gives it the host's sidebar and page header instead of a parallel
 * navigation, and it is where the `LOANS_ENABLED` flag is read now.
 *
 * The legacy `/loans` path is kept so a bookmark or an external link keeps
 * working — but only while the feature was built in. With the flag off there is
 * no view to land on and the redirect would leave the shell empty, so it falls
 * to `PageError` like any other path that is not there.
 */

const NavigateRefSetter = () => {
  const navigate = useNavigate();
  useEffect(() => {
    navigationRef.current = navigate;
    return () => {
      navigationRef.current = null;
    };
  }, [navigate]);
  return null;
};

const routesFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

const RoutesComponent = () => (
  <BrowserRouter future={routesFutureFlags}>
    <>
      <NavigateRefSetter />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/project" replace />} />
          <Route path="/authenticate" element={<Authenticate />} />
          <Route path="/project/*" element={<Project />} />
          <Route
            path="/loans/*"
            element={LOANS_ENABLED ? <Navigate to="/project/loans" replace /> : <PageError />}
          />
          <Route path="*" element={<PageError />} />
        </Routes>
      </Suspense>
    </>
  </BrowserRouter>
);

export default RoutesComponent;
