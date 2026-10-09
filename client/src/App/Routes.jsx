import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import { navigationRef } from 'shared/utils/navigationRef';
import { LOANS_ENABLED } from 'shared/utils/loansFlag';
import PageLoader from 'shared/components/PageLoader';

const Project = lazy(() => import('Project'));
const Loans = lazy(() => import('Loans'));
const Authenticate = lazy(() => import('Auth/Authenticate'));
const PageError = lazy(() => import('shared/components/PageError'));

/*
 * The optional Loans app is registered only when it was built in: with the flag
 * off, `/loans` falls through to `PageError` instead of loading a feature that
 * is not there. `shared/utils/loansFlag` is the single client-side read.
 *
 * The lazy import above stays unconditional on purpose. Removing the feature's
 * code is the production config's job (`resolve.alias`), not this file's — an
 * `import()` guarded by a folded constant still enters the module graph.
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
          {LOANS_ENABLED && <Route path="/loans/*" element={<Loans />} />}
          <Route path="*" element={<PageError />} />
        </Routes>
      </Suspense>
    </>
  </BrowserRouter>
);

export default RoutesComponent;
