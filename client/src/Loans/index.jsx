import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Borrowers from './Borrowers';
import BorrowerPicker from './BorrowerPicker';
import { loanCopy, loanNavigation } from './copy';
import { Panel, Shell } from './Styles';

const Loans = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const initial = location.pathname.split('/')[2];
  const [view, setView] = useState(
    loanNavigation.some((item) => item.key === initial) ? initial : 'dashboard',
  );
  const [selectedBorrower, setSelectedBorrower] = useState(null);
  const select = (key) => {
    setView(key);
    navigate(`/loans/${key}`, { replace: true });
  };
  return (
    <Shell>
      <h1>{loanCopy.title}</h1>
      <Sidebar items={loanNavigation} active={view} onSelect={select} />
      {view === 'borrowers' ? (
        <Borrowers />
      ) : view === 'new-loan' ? (
        <Panel>
          <h2>{loanCopy.newLoan}</h2>
          <BorrowerPicker value={selectedBorrower} onChange={setSelectedBorrower} />
          {selectedBorrower && (
            <p>
              Persona seleccionada: {selectedBorrower.firstName} {selectedBorrower.lastName}
            </p>
          )}
        </Panel>
      ) : (
        <Panel>
          <h2>{loanNavigation.find((item) => item.key === view)?.label}</h2>
          <p>Esta vista se viene pronto. Estamos preparando todo para vos.</p>
        </Panel>
      )}
    </Shell>
  );
};
export default Loans;
