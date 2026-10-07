import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Borrowers from './Borrowers';
import LoanForm from './LoanForm';
import LoansList from './LoansList';
import { loanCopy, loanNavigation } from './copy';
import { Panel, Shell } from './Styles';

/** `/loans/new-loan/12` → `12`; anything else → `null`. */
const editLoanId = (pathname) => {
  const [, , view, loanId] = pathname.split('/');
  return view === 'new-loan' && loanId ? loanId : null;
};

function Loans() {
  const navigate = useNavigate();
  const location = useLocation();
  const initial = location.pathname.split('/')[2];
  const [view, setView] = useState(
    loanNavigation.some((item) => item.key === initial) ? initial : 'dashboard',
  );
  const [loanId, setLoanId] = useState(() => editLoanId(location.pathname));

  // The URL is the source of truth: the list links straight to the edit route.
  useEffect(() => {
    const next = editLoanId(location.pathname);
    setLoanId(next);
    const nextView = location.pathname.split('/')[2];
    if (loanNavigation.some((item) => item.key === nextView)) setView(nextView);
  }, [location.pathname]);

  const select = (key) => {
    setView(key);
    setLoanId(null);
    navigate(`/loans/${key}`, { replace: true });
  };

  const renderView = () => {
    if (view === 'borrowers') return <Borrowers />;
    if (view === 'loans') return <LoansList />;
    if (view === 'new-loan') return <LoanForm key={loanId || 'new'} loanId={loanId} />;
    return (
      <Panel>
        <h2>{loanNavigation.find((item) => item.key === view)?.label}</h2>
        <p>Esta vista se viene pronto. Estamos preparando todo para vos.</p>
      </Panel>
    );
  };

  return (
    <Shell>
      <h1>{loanCopy.title}</h1>
      <Sidebar items={loanNavigation} active={view} onSelect={select} />
      {renderView()}
    </Shell>
  );
}
export default Loans;
