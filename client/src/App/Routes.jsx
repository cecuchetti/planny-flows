import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import { navigationRef } from 'shared/utils/navigationRef';
import Project from 'Project';
import Authenticate from 'Auth/Authenticate';
import PageError from 'shared/components/PageError';

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
      <Routes>
        <Route path="/" element={<Navigate to="/project" replace />} />
        <Route path="/authenticate" element={<Authenticate />} />
        <Route path="/project/*" element={<Project />} />
        <Route path="*" element={<PageError />} />
      </Routes>
    </>
  </BrowserRouter>
);

export default RoutesComponent;
