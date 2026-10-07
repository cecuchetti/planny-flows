import React, { useEffect, useState } from 'react';
import ConfirmModal from 'shared/components/ConfirmModal';
import InputDebounced from 'shared/components/InputDebounced';
import toast from 'shared/utils/toast';
import api from 'shared/utils/api';
import Button from 'shared/components/Button';
import { borrowerCopy } from '../copy';
import { Field, Input, Panel, Row } from '../Styles';

const empty = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  nationalId: '',
  notes: '',
};
function Borrowers() {
  const [search, setSearch] = useState('');
  const [borrowers, setBorrowers] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const load = () => {
    setLoading(true);
    return api
      .get('/api/v1/borrowers', { search })
      .then((d) => setBorrowers(d.borrowers || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    setLoadError(null);
    load().catch(() => setLoadError('No pudimos cargar las personas. Intentá de nuevo.'));
  }, [search]);
  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const save = (event) => {
    event.preventDefault();
    const request = editing
      ? api.put(`/api/v1/borrowers/${editing}`, form)
      : api.post('/api/v1/borrowers', form);
    request
      .then(() => {
        toast.success(editing ? 'Persona actualizada.' : 'Persona creada.');
        setForm(empty);
        setEditing(null);
        return load();
      })
      .catch((error) => toast.error(error));
  };
  const remove = (id) =>
    api
      .delete(`/api/v1/borrowers/${id}`)
      .then(() => {
        toast.success('Persona eliminada.');
        return load();
      })
      .catch((error) => toast.error(error));
  let directoryContent;
  if (loadError) {
    directoryContent = (
      <div role="alert">
        <p>{loadError}</p>
        <Button
          onClick={() => {
            setLoadError(null);
            load().catch(() => setLoadError('No pudimos cargar las personas. Intentá de nuevo.'));
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  } else if (isLoading) {
    directoryContent = <p>Cargando personas…</p>;
  } else if (borrowers.length === 0) {
    directoryContent = <p>{search ? borrowerCopy.noMatches : borrowerCopy.empty}</p>;
  } else {
    directoryContent = borrowers.map((borrower) => (
      <Row key={borrower.id}>
        <span>
          {borrower.firstName} {borrower.lastName}
        </span>
        <Button
          onClick={() => {
            setEditing(borrower.id);
            setForm(borrower);
          }}
        >
          Editar
        </Button>
        <ConfirmModal
          variant="danger"
          title="¿Eliminar persona?"
          message="Esta acción no se puede deshacer."
          confirmText="Eliminar"
          renderLink={(props) => <Button {...props}>Eliminar</Button>}
          onConfirm={({ close }) => remove(borrower.id).finally(close)}
        />
      </Row>
    ));
  }
  return (
    <Panel>
      <h2>{borrowerCopy.title}</h2>
      <InputDebounced value={search} onChange={setSearch} placeholder={borrowerCopy.search} />
      <form onSubmit={save}>
        <Row>
          {['firstName', 'lastName', 'email', 'phone', 'address', 'nationalId'].map((name) => (
            <Field key={name}>
              <span>{borrowerCopy[name]}</span>
              <Input
                name={name}
                required={name === 'firstName' || name === 'lastName'}
                value={form[name]}
                onChange={change}
              />
            </Field>
          ))}
        </Row>
        <Field>
          <span>{borrowerCopy.notes}</span>
          <Input name="notes" value={form.notes} onChange={change} />
        </Field>
        <Button variant="primary">{editing ? 'Guardar cambios' : borrowerCopy.add}</Button>
      </form>
      {directoryContent}
    </Panel>
  );
}
export default Borrowers;
