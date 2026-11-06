import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Formik } from 'formik';
import get from 'lodash/get';
import { useNavigate } from 'react-router-dom';

import TailwindConfirmModal from 'shared/components/ConfirmModal/TailwindConfirmModal';
import PageLoader from 'shared/components/PageLoader';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';

import { borrowerCopy } from '../copy';

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  nationalId: '',
  notes: '',
};

const PROFILE_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'address', 'nationalId'];

const validateBorrower = (values) => {
  const errors = {};
  ['firstName', 'lastName'].forEach((name) => {
    if (String(values[name] || '').trim() === '') errors[name] = borrowerCopy.required;
  });
  return errors;
};

/** Extract initials from first + last name (uppercase, 2 chars). */
const getInitials = (firstName, lastName) => {
  const a = (firstName || '')[0] || '';
  const b = (lastName || '')[0] || '';
  return (a + b).toUpperCase();
};

/** Gradient class for the avatar based on name hash (deterministic). */
const avatarGradient = (seed) => {
  const gradients = [
    'from-primary to-secondary',
    'from-surface-variant to-secondary-container',
    'from-secondary to-primary-container',
    'from-primary to-primary-container',
    'from-secondary-container to-secondary',
  ];
  let hash = 0;
  for (let i = 0; i < (seed || '').length; i += 1) {
    hash = seed.charCodeAt(i) + (hash * 32 - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
};

/** Get WhatsApp link from a phone number (digits only). */
const whatsappLink = (phone) => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '#';
};

function Borrowers() {
  const [search, setSearch] = useState('');
  const [borrowers, setBorrowers] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchValue, setSearchValue] = useState('');
  const searchTimeout = useRef(null);
  const formContainerRef = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    return api
      .get('/api/v1/borrowers', { search })
      .then((data) => setBorrowers(data.borrowers || []))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    setLoadError(null);
    load().catch(() => setLoadError(borrowerCopy.loadError));
  }, [load]);

  /* Sync searchValue with external searchTerm (for Clear button) */
  useEffect(() => {
    setSearchValue(search);
  }, [search]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchValue(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setSearch(value), 300);
  };

  const save = (values) => {
    /*
     * Only the fields the endpoint accepts. Edit mode seeds the form from the
     * API's own borrower, which carries `loanCount` (a response field), and
     * posting the whole Formik bag would send it back on the wire.
     */
    const payload = PROFILE_FIELDS.concat('notes').reduce(
      (body, name) => ({ ...body, [name]: values[name] ?? '' }),
      {},
    );
    const request = editing
      ? api.put(`/api/v1/borrowers/${editing}`, payload)
      : api.post('/api/v1/borrowers', payload);
    return request
      .then(() => {
        toast.success(editing ? borrowerCopy.updated : borrowerCopy.created);
        setEditing(null);
        setFormOpen(false);
        return load();
      })
      .catch((error) => {
        toast.error(error);
        // Rethrown so the form's own submit state settles, rather than resolving
        // on a write that failed.
        throw error;
      });
  };

  const remove = (id) =>
    api
      .delete(`/api/v1/borrowers/${id}`)
      .then(() => {
        toast.success(borrowerCopy.removed);
        if (editing === id) setEditing(null);
        return load();
      })
      .catch((error) => toast.error(error));

  const retry = () => {
    setLoadError(null);
    load().catch(() => setLoadError(borrowerCopy.loadError));
  };

  const openForm = () => {
    setEditing(null);
    setFormOpen(true);
  };

  /** Filtered list based on current filter state */
  const filteredBorrowers = borrowers.filter((b) => {
    const activeLoans = b.activeLoanCount || 0;
    const totalLoans = b.loanCount || 0;
    if (filter === 'active') return activeLoans > 0;
    if (filter === 'settled') return totalLoans > 0 && activeLoans === 0;
    if (filter === 'none') return totalLoans === 0;
    return true; // 'all'
  });

  const FILTERS = [
    { key: 'all', label: 'Todos' },
    { key: 'active', label: 'Con préstamos activos' },
    { key: 'settled', label: 'Sin deuda' },
    { key: 'none', label: 'Sin préstamos' },
  ];

  /** Count helper for the full list (not filtered) */
  const countForFilter = (key) => {
    if (key === 'all') return borrowers.length;
    if (key === 'active') return borrowers.filter((b) => (b.activeLoanCount || 0) > 0).length;
    if (key === 'settled')
      return borrowers.filter((b) => (b.loanCount || 0) > 0 && !(b.activeLoanCount || 0) > 0)
        .length;
    if (key === 'none') return borrowers.filter((b) => (b.loanCount || 0) === 0).length;
    return 0;
  };

  let directoryContent;
  if (loadError) {
    directoryContent = (
      <div role="alert" className="flex flex-col items-center gap-space-md py-space-lg">
        <span className="text-error font-body-md text-body-md">{loadError}</span>
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-colors"
          onClick={retry}
        >
          {borrowerCopy.retry}
        </button>
      </div>
    );
  } else if (isLoading) {
    directoryContent = <PageLoader />;
  } else if (filteredBorrowers.length === 0) {
    directoryContent = (
      <div className="bg-surface-container-lowest rounded-xl p-space-xl flex flex-col items-center justify-center text-center gap-space-sm shadow-sm">
        <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-outline">
          <span className="material-symbols-outlined text-[24px]">person_off</span>
        </div>
        <h4 className="font-headline-md text-headline-md text-on-surface">
          {search || filter !== 'all' ? borrowerCopy.noMatches : borrowerCopy.empty}
        </h4>
        {(search || filter !== 'all') && (
          <React.Fragment>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
              {borrowerCopy.noMatchesHint}
            </p>
            <button
              type="button"
              className="mt-2 px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-colors"
              onClick={() => {
                setSearch('');
                setSearchValue('');
                setFilter('all');
              }}
            >
              {borrowerCopy.clearFilters}
            </button>
          </React.Fragment>
        )}
      </div>
    );
  } else {
    directoryContent = (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-md">
        {filteredBorrowers.map((borrower) => {
          const initials = getInitials(borrower.firstName, borrower.lastName);
          const fullName = `${borrower.firstName || ''} ${borrower.lastName || ''}`.trim();
          const activeLoans = borrower.activeLoanCount || 0;
          const totalLoans = borrower.loanCount || 0;
          const hasActive = activeLoans > 0;
          const isSettled = totalLoans > 0 && !hasActive;
          const isProspect = totalLoans === 0;
          // API returns recoveryPercent as 0–100 number
          const recoveryPct = borrower.recoveryPercent != null ? borrower.recoveryPercent : 0;
          const recoveredLabel =
            recoveryPct >= 100 ? '100% saldado' : `${Math.round(recoveryPct)}%`;

          return (
            <article
              key={borrower.id}
              className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div className="flex flex-col gap-space-md">
                {/* Header: Avatar & Quick Badges */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-space-sm flex-1 min-w-0">
                    <div className="relative shrink-0">
                      <div
                        className={`w-12 h-12 rounded-full bg-gradient-to-tr ${avatarGradient(fullName)} flex items-center justify-center text-on-primary font-headline-md text-headline-md font-semibold shadow-inner`}
                      >
                        {initials}
                      </div>
                      {/* Only show green dot for active loans — no dot for settled */}
                      {hasActive && (
                        <span
                          className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full ring-2 ring-surface-container-lowest bg-tertiary"
                          title="Verificado"
                        />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-headline-md text-headline-md text-on-surface font-semibold tracking-tight truncate">
                          {fullName}
                        </h3>
                        {!isProspect && (
                          <span
                            className={`material-symbols-outlined text-[17px] shrink-0 ${
                              hasActive ? 'text-primary' : 'text-tertiary'
                            }`}
                            title={hasActive ? 'Legajo completo' : 'Deuda saldada'}
                          >
                            {hasActive ? 'verified' : 'check_circle'}
                          </span>
                        )}
                      </div>
                      <span className="font-code-key text-code-key text-outline truncate">
                        CUIT: {borrower.nationalId || '—'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {totalLoans > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md font-semibold">
                        {totalLoans} {totalLoans === 1 ? 'Préstamo' : 'Préstamos'}
                      </span>
                    )}
                    {totalLoans === 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-surface-container text-outline font-label-md text-label-md font-medium">
                        0 Préstamos
                      </span>
                    )}
                    {hasActive && (
                      <span className="px-2 py-0.5 rounded-md bg-tertiary-container/15 text-tertiary font-label-md text-label-md font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                        {activeLoans} Activo{activeLoans > 1 ? 's' : ''}
                      </span>
                    )}
                    {isSettled && (
                      <span className="px-2 py-0.5 rounded-md bg-surface-container text-on-surface-variant font-label-md text-label-md font-medium">
                        Sin deuda pendiente
                      </span>
                    )}
                    {isProspect && (
                      <span className="px-2 py-0.5 rounded-md bg-surface-container-low text-on-surface-variant font-label-md text-label-md">
                        Prospecto
                      </span>
                    )}
                  </div>
                </div>

                {/* Contact & Geo Info */}
                <div className="bg-surface-container-low/60 rounded-lg p-2.5 flex flex-col gap-1.5 text-on-surface-variant font-body-sm text-body-sm">
                  {borrower.email && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 truncate">
                        <span className="material-symbols-outlined text-[17px] text-outline">
                          mail
                        </span>
                        <span className="truncate">{borrower.email}</span>
                      </span>
                      <button
                        type="button"
                        className="text-outline hover:text-primary transition-colors shrink-0"
                        title="Copiar email"
                        onClick={() => {
                          navigator.clipboard.writeText(borrower.email);
                          toast.success('Email copiado');
                        }}
                      >
                        <span className="material-symbols-outlined text-[15px]">content_copy</span>
                      </button>
                    </div>
                  )}
                  {borrower.phone && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[17px] text-tertiary">
                          call
                        </span>
                        <span>{borrower.phone}</span>
                      </span>
                      <a
                        className="px-1.5 py-0.5 rounded bg-tertiary-container/15 text-tertiary hover:bg-tertiary-container/25 text-[11px] font-label-md flex items-center gap-1 font-semibold transition-colors shrink-0"
                        href={whatsappLink(borrower.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span>WhatsApp</span>
                        <span className="material-symbols-outlined text-[13px]">arrow_outward</span>
                      </a>
                    </div>
                  )}
                  {borrower.address && (
                    <div className="flex items-center gap-2 truncate">
                      <span className="material-symbols-outlined text-[17px] text-outline">
                        location_on
                      </span>
                      <span className="truncate">{borrower.address}</span>
                    </div>
                  )}
                </div>

                {/* Financial Position Cardlet */}
                {totalLoans > 0 && (
                  <div className="bg-surface-container-low rounded-lg p-space-sm flex flex-col gap-2">
                    <div className="flex items-center justify-between font-label-md text-label-md">
                      <span className="text-outline">Saldo recuperado:</span>
                      <span className="font-code-key font-semibold text-tertiary">
                        {recoveredLabel}
                      </span>
                    </div>
                    <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                      <div
                        // Solid color: tertiary when >= 70%, primary otherwise (no gradient)
                        className={`h-full rounded-full ${
                          recoveryPct >= 70 ? 'bg-tertiary' : 'bg-primary'
                        }`}
                        style={{ width: `${Math.min(recoveryPct, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1 font-body-sm text-body-sm">
                      <div>
                        <span className="text-outline block text-[11px]">
                          {isSettled ? 'Total cancelado' : 'Total histórico'}
                        </span>
                        <span className="font-code-key font-medium text-on-surface">
                          {/* API returns totalHistoricalAmount */}
                          {borrower.totalHistoricalAmount
                            ? `$${Number(borrower.totalHistoricalAmount).toLocaleString('es-AR')} ARS`
                            : '—'}
                        </span>
                        {/* TODO: currency per-loan (ARS/USD) not yet available from API — hardcoded ARS per spec */}
                      </div>
                      <div className="text-right">
                        {isSettled ? (
                          <React.Fragment>
                            <span className="text-tertiary block text-[11px] font-semibold">
                              Estado
                            </span>
                            <span className="font-code-key font-bold text-tertiary">
                              {borrower.remainingBalance
                                ? `$${Number(borrower.remainingBalance).toLocaleString('es-AR')} ARS`
                                : '$0,00 ARS'}
                            </span>
                          </React.Fragment>
                        ) : (
                          <React.Fragment>
                            <span className="text-error block text-[11px] font-semibold">
                              Resta cobrar
                            </span>
                            <span className="font-code-key font-bold text-error">
                              {borrower.remainingBalance
                                ? `$${Number(borrower.remainingBalance).toLocaleString('es-AR')} ARS`
                                : '—'}
                            </span>
                          </React.Fragment>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes section for prospects */}
                {isProspect && borrower.notes && (
                  <div className="bg-surface-container-low rounded-lg p-space-sm flex flex-col gap-1">
                    <span className="font-overline text-overline uppercase tracking-wider text-outline">
                      Observación de legajo:
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                      {borrower.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-space-md mt-space-sm">
                {isProspect ? (
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md font-semibold hover:bg-primary transition-all flex items-center gap-1.5 shadow-sm"
                    onClick={() => navigate('/project/loans/new-loan')}
                  >
                    <span className="material-symbols-outlined text-[16px]">add_circle</span>
                    Crear préstamo
                  </button>
                ) : (
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-surface-container-high text-primary font-label-md text-label-md font-semibold hover:bg-primary hover:text-on-primary transition-all flex items-center gap-1.5"
                    onClick={() => navigate('/project/loans')}
                  >
                    <span className="material-symbols-outlined text-[16px]">folder_open</span>
                    {borrowerCopy.viewFile}
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                    title="Editar persona"
                    onClick={() => {
                      setEditing(borrower.id);
                      setFormOpen(true);
                      setTimeout(() => {
                        formContainerRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      }, 0);
                      toast.success(`Cargaste los datos de ${borrower.firstName} para editar.`);
                    }}
                  >
                    <span className="material-symbols-outlined text-[17px]">edit</span>
                  </button>
                  <button
                    type="button"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:bg-error-container hover:text-on-error-container transition-colors"
                    title="Eliminar"
                    onClick={() => setDeletingId(borrower.id)}
                  >
                    <span className="material-symbols-outlined text-[17px]">delete</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  const editingBorrower = borrowers.find((item) => item.id === editing);

  return (
    <div className="flex flex-col gap-space-lg max-w-[1360px] mx-auto w-full">
      {/* Header */}
      <header className="flex flex-col gap-space-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          <div>
            <div className="flex items-center gap-space-sm">
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                {borrowerCopy.title}
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-surface-container-high text-primary font-label-md text-label-md">
                {borrowers.length} registradas
              </span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
              Directorio de personas prestatarias, datos de contacto y legajos de préstamos.
            </p>
          </div>
          <div className="flex items-center gap-space-sm self-start md:self-auto">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg shadow-sm hover:bg-primary transition-all active:scale-[0.98]"
              onClick={openForm}
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              <span>+ Nueva persona</span>
            </button>
          </div>
        </div>
      </header>

      {/* Filter & Search Bar */}
      <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-space-sm">
        <div className="relative w-full md:w-96 flex items-center">
          <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-[20px] text-outline">search</span>
          </span>
          <input
            className="w-full h-10 pl-10 pr-4 bg-surface-container-low rounded-lg text-on-surface placeholder:text-outline font-body-md text-body-md focus:bg-surface-container-lowest focus:outline-none border-0 transition-all"
            placeholder="Buscá por nombre, apellido, DNI o email..."
            type="text"
            value={searchValue}
            onChange={handleSearchChange}
            aria-label={borrowerCopy.search}
          />
        </div>
        {/* Filter pills — functional buttons */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors ${
                filter === key
                  ? 'bg-surface-container-high text-primary font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container-low'
              }`}
            >
              {label} ({countForFilter(key)})
            </button>
          ))}
        </div>
      </div>

      {/* Inline Collapsible Form Accordion — always rendered */}
      <section
        ref={formContainerRef}
        className="bg-surface-container-lowest rounded-xl shadow-md overflow-hidden transition-all duration-300"
      >
        <div className="p-space-lg flex flex-col gap-space-md">
          {/* Clickable accordion header */}
          <button
            type="button"
            onClick={() => setFormOpen((prev) => !prev)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-space-sm">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[19px]">badge</span>
              </div>
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight">
                  Agregar o editar persona
                </h2>
                <span className="font-body-sm text-body-sm text-outline">
                  Formulario de legajo y registro de persona deudora
                </span>
              </div>
            </div>
            <div className="flex items-center gap-space-sm">
              <span className="px-2.5 py-1 rounded bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md font-semibold">
                Formulario de legajo
              </span>
              <span
                className={`material-symbols-outlined transition-transform duration-200 ${
                  formOpen ? 'rotate-180' : ''
                }`}
              >
                expand_more
              </span>
            </div>
          </button>

          {/* Collapsible body using grid-rows trick */}
          <div
            className={`grid transition-[grid-template-rows] duration-300 ${
              formOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
          >
            <div className="overflow-hidden min-h-0">
              {/*
               * `editing` switches the section between "add" and "edit"; the key remounts
               * the form so it starts from the person being edited instead of the one it
               * was showing before.
               */}
              <Formik
                key={editing || 'new'}
                initialValues={editingBorrower ? { ...EMPTY, ...editingBorrower } : EMPTY}
                validateOnChange={false}
                onSubmit={(values, actions) => {
                  const errs = validateBorrower(values);
                  if (Object.keys(errs).length > 0) {
                    actions.setErrors(errs);
                    actions.setSubmitting(false);
                    const firstId = Object.keys(errs)[0];
                    const el = document.getElementById(firstId);
                    if (el) el.focus();
                    return;
                  }
                  save(values)
                    .then(() => {
                      actions.resetForm({ values: EMPTY });
                      setFormOpen(false);
                    })
                    .catch(() => {
                      /* error already handled in save() via toast.error */
                    })
                    .finally(() => {
                      actions.setSubmitting(false);
                    });
                }}
              >
                {({
                  values,
                  errors,
                  handleSubmit,
                  handleChange,
                  handleBlur,
                  isSubmitting,
                  resetForm,
                }) => (
                  <form className="flex flex-col gap-space-md pt-space-md" onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-md">
                      {/* Nombre */}
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label
                          className="font-label-md text-label-md text-on-surface font-medium"
                          htmlFor="firstName"
                        >
                          {borrowerCopy.firstName} <span className="text-error font-bold">*</span>
                        </label>
                        <input
                          id="firstName"
                          name="firstName"
                          className={`h-10 px-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md focus:bg-surface-container-lowest transition-colors border-0 outline-none w-full min-w-0 ${
                            get(errors, 'firstName')
                              ? 'ring-2 ring-inset ring-error/40 bg-surface-container-lowest'
                              : ''
                          }`}
                          placeholder="p. ej. Ana"
                          value={values.firstName}
                          onChange={handleChange}
                          onBlur={handleBlur}
                        />
                        {get(errors, 'firstName') && (
                          <span className="text-error font-body-sm text-body-sm mt-0.5">
                            {errors.firstName}
                          </span>
                        )}
                      </div>

                      {/* Apellido */}
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label
                          className="font-label-md text-label-md text-on-surface font-medium"
                          htmlFor="lastName"
                        >
                          {borrowerCopy.lastName} <span className="text-error font-bold">*</span>
                        </label>
                        <input
                          id="lastName"
                          name="lastName"
                          className={`h-10 px-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md focus:bg-surface-container-lowest transition-colors border-0 outline-none w-full min-w-0 ${
                            get(errors, 'lastName')
                              ? 'ring-2 ring-inset ring-error/40 bg-surface-container-lowest'
                              : ''
                          }`}
                          placeholder="p. ej. Gómez"
                          value={values.lastName}
                          onChange={handleChange}
                          onBlur={handleBlur}
                        />
                        {get(errors, 'lastName') && (
                          <span className="text-error font-body-sm text-body-sm mt-0.5">
                            {errors.lastName}
                          </span>
                        )}
                      </div>

                      {/* DNI / CUIT */}
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label
                          className="font-label-md text-label-md text-on-surface font-medium"
                          htmlFor="nationalId"
                        >
                          {borrowerCopy.nationalId}
                        </label>
                        <input
                          id="nationalId"
                          name="nationalId"
                          className="h-10 px-3 rounded-lg bg-surface-container-low font-code-key text-code-key text-on-surface placeholder:text-outline focus:bg-surface-container-lowest transition-colors border-0 outline-none w-full min-w-0"
                          placeholder="p. ej. 27-38194829-4"
                          value={values.nationalId}
                          onChange={handleChange}
                          onBlur={handleBlur}
                        />
                      </div>

                      {/* Teléfono / WhatsApp */}
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label
                          className="font-label-md text-label-md text-on-surface font-medium"
                          htmlFor="phone"
                        >
                          {borrowerCopy.phone}
                        </label>
                        <div className="relative flex items-center">
                          <input
                            id="phone"
                            name="phone"
                            type="tel"
                            className="w-full h-10 pl-3 pr-9 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md focus:bg-surface-container-lowest transition-colors border-0 outline-none min-w-0"
                            placeholder="+54 9 351 491-0028"
                            value={values.phone}
                            onChange={handleChange}
                            onBlur={handleBlur}
                          />
                          <span className="material-symbols-outlined absolute right-2.5 text-tertiary text-[18px]">
                            chat
                          </span>
                        </div>
                      </div>

                      {/* Email */}
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label
                          className="font-label-md text-label-md text-on-surface font-medium"
                          htmlFor="email"
                        >
                          {borrowerCopy.email}
                        </label>
                        <input
                          id="email"
                          name="email"
                          type="email"
                          className="h-10 px-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md focus:bg-surface-container-lowest transition-colors border-0 outline-none w-full min-w-0"
                          placeholder="ana.gomez@visplatform.io"
                          value={values.email}
                          onChange={handleChange}
                          onBlur={handleBlur}
                        />
                      </div>

                      {/* Domicilio / Ciudad */}
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label
                          className="font-label-md text-label-md text-on-surface font-medium"
                          htmlFor="address"
                        >
                          {borrowerCopy.address}
                        </label>
                        <input
                          id="address"
                          name="address"
                          className="h-10 px-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md focus:bg-surface-container-lowest transition-colors border-0 outline-none w-full min-w-0"
                          placeholder="B° Nueva Córdoba, Córdoba Capital"
                          value={values.address}
                          onChange={handleChange}
                          onBlur={handleBlur}
                        />
                      </div>
                    </div>

                    {/* Notas / Observaciones */}
                    <div className="flex flex-col gap-1.5">
                      <label
                        className="font-label-md text-label-md text-on-surface font-medium"
                        htmlFor="notes"
                      >
                        {borrowerCopy.notes}
                      </label>
                      <textarea
                        id="notes"
                        name="notes"
                        className="p-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md focus:bg-surface-container-lowest transition-colors resize-y border-0 outline-none w-full min-w-0"
                        placeholder="p. ej. Clienta de confianza. Empleada bancaria, cobro del 1 al 10 de cada mes."
                        rows={2}
                        value={values.notes}
                        onChange={handleChange}
                        onBlur={handleBlur}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md pt-space-xs">
                      <p className="font-body-sm text-body-sm text-outline">
                        Los campos con <span className="text-error font-semibold">*</span> son
                        obligatorios para la emisión formal de recibos y pagarés.
                      </p>
                      <div className="flex items-center gap-space-md shrink-0">
                        <button
                          type="button"
                          className="px-4 h-10 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-label-md text-label-md transition-colors"
                          onClick={() => resetForm({ values: EMPTY })}
                        >
                          {borrowerCopy.clearForm}
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="px-5 h-10 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg shadow-sm hover:bg-primary transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {isSubmitting && (
                            <span className="material-symbols-outlined text-[18px] animate-spin">
                              progress_activity
                            </span>
                          )}
                          <span>{borrowerCopy.save}</span>
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </Formik>
            </div>
          </div>
        </div>
      </section>

      {/* People Directory Cards Grid */}
      <main>{directoryContent}</main>

      {/* Delete confirmation modal */}
      <TailwindConfirmModal
        isOpen={deletingId !== null}
        onClose={() => setDeletingId(null)}
        variant="danger"
        title={borrowerCopy.removeTitle}
        message={borrowerCopy.removeMessage}
        confirmText={borrowerCopy.remove}
        cancelText="Cancelar"
        onConfirm={({ close }) => {
          if (deletingId !== null) {
            remove(deletingId).finally(close);
          } else {
            close();
          }
        }}
      />
    </div>
  );
}

export default Borrowers;
