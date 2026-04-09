import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import { navigationRef } from 'shared/utils/navigationRef';
import PageLoader from 'shared/components/PageLoader';

const Project = lazy(() => import('Project'));
const Authenticate = lazy(() => import('Auth/Authenticate'));
const PageError = lazy(() => import('shared/components/PageError'));

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
          <Route path="*" element={<PageError />} />
        </Routes>
      </Suspense>
    </>
  </BrowserRouter>
);

export default RoutesComponent;
