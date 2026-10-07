import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import InputDebounced from 'shared/components/InputDebounced';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { Input, Row } from './Styles';

function BorrowerPicker({ onChange }) {
  const [query, setQuery] = useState('');
  const [borrowers, setBorrowers] = useState([]);
  const [isLoading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newPerson, setNewPerson] = useState({ firstName: '', lastName: '' });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api
      .get('/api/v1/borrowers', { search: query })
      .then((data) => {
        if (!cancelled) setBorrowers(data.borrowers || []);
      })
      .catch(() => {
        if (!cancelled) setLoadError('No pudimos buscar personas. Intentá de nuevo.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);
  return (
    <div>
      <InputDebounced value={query} onChange={setQuery} placeholder="Buscá una persona" />
      {isLoading && <small>Cargando personas…</small>}
      {loadError && (
        <div role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => setQuery(query)}>
            Reintentar
          </button>
        </div>
      )}
      {!loadError && (
        <Row role="listbox">
          {borrowers.map((borrower) => (
            <button type="button" key={borrower.id} onClick={() => onChange(borrower)}>
              {borrower.firstName} {borrower.lastName}
            </button>
          ))}
        </Row>
      )}
      {!loadError && query && borrowers.length === 0 && (
        <div>
          <small>No encontramos coincidencias. Podés crearla abajo.</small>
          {!creating && (
            <button type="button" onClick={() => setCreating(true)}>
              Crear persona
            </button>
          )}
          {creating && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                api
                  .post('/api/v1/borrowers', newPerson)
                  .then((data) => {
                    if (data.borrower) onChange(data.borrower);
                  })
                  .catch((error) => toast.error(error));
              }}
            >
              <Input
                required
                placeholder="Nombre"
                value={newPerson.firstName}
                onChange={(event) => setNewPerson({ ...newPerson, firstName: event.target.value })}
              />
              <Input
                required
                placeholder="Apellido"
                value={newPerson.lastName}
                onChange={(event) => setNewPerson({ ...newPerson, lastName: event.target.value })}
              />
              <button type="submit">Guardar persona</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
BorrowerPicker.propTypes = { onChange: PropTypes.func.isRequired };
export default BorrowerPicker;
