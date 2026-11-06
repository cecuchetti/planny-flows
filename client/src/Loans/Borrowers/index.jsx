import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import TailwindConfirmModal from 'shared/components/ConfirmModal/TailwindConfirmModal';
import PageLoader from 'shared/components/PageLoader';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';

import { borrowerCopy } from '../copy';
import { getInitials, avatarGradient, whatsappLink } from '../personUtils';

function Borrowers() {
  const [search, setSearch] = useState('');
  const [borrowers, setBorrowers] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchValue, setSearchValue] = useState('');
  const [view, setView] = useState(() => localStorage.getItem('borrowers-view') || 'table');
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const searchTimeout = useRef(null);
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

  /* Clear row selection when search or filter changes */
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, filter]);

  /* Sync searchValue with external searchTerm (for Clear button) */
  useEffect(() => {
    setSearchValue(search);
  }, [search]);

  const handleSearchChange = (e) => {
    const { value } = e.target;
    setSearchValue(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setSearch(value), 300);
  };

  const remove = (id) =>
    api
      .delete(`/api/v1/borrowers/${id}`)
      .then(() => {
        toast.success(borrowerCopy.removed);
        return load();
      })
      .catch((error) => toast.error(error));

  const retry = () => {
    setLoadError(null);
    load().catch(() => setLoadError(borrowerCopy.loadError));
  };

  /** Filtered list based on current filter state */
  const filteredBorrowers = useMemo(
    () =>
      borrowers.filter((b) => {
        const activeLoans = b.activeLoanCount || 0;
        const totalLoans = b.loanCount || 0;
        if (filter === 'active') return activeLoans > 0;
        if (filter === 'settled') return totalLoans > 0 && activeLoans === 0;
        if (filter === 'none') return totalLoans === 0;
        return true; // 'all'
      }),
    [borrowers, filter],
  );

  /** Sorted list of filtered borrowers for table view */
  const sortedBorrowers = useMemo(() => {
    const sorted = [...filteredBorrowers];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sort.key === 'name') {
        const nameA = `${a.lastName || ''} ${a.firstName || ''}`.toLowerCase();
        const nameB = `${b.lastName || ''} ${b.firstName || ''}`.toLowerCase();
        cmp = nameA.localeCompare(nameB);
      } else if (sort.key === 'loans') {
        cmp = (a.loanCount || 0) - (b.loanCount || 0);
      } else if (sort.key === 'recovery') {
        cmp = (a.recoveryPercent || 0) - (b.recoveryPercent || 0);
      } else if (sort.key === 'balance') {
        cmp = (a.remainingBalance || 0) - (b.remainingBalance || 0);
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredBorrowers, sort]);

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
  } else if (view === 'cards') {
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
                        <button
                          type="button"
                          className="font-headline-md text-headline-md text-on-surface font-semibold tracking-tight truncate hover:text-primary transition-colors cursor-pointer text-left"
                          onClick={() => navigate(`/project/loans/borrowers/${borrower.id}`)}
                        >
                          {fullName}
                        </button>
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
                    onClick={() => navigate(`/project/loans/borrowers/${borrower.id}`)}
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
  } else {
    /* Table view */
    const displayBorrowers = sortedBorrowers;
    const allFilteredSelected =
      displayBorrowers.length > 0 && displayBorrowers.every((b) => selectedIds.has(b.id));
    const someFilteredSelected = displayBorrowers.some((b) => selectedIds.has(b.id));

    const toggleSort = (key) => {
      setSort((prev) => ({
        key,
        dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
      }));
    };

    const sortIcon = (key) => {
      if (sort.key !== key) return null;
      return (
        <span className="material-symbols-outlined text-[15px]">
          {sort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
        </span>
      );
    };

    directoryContent = (
      <React.Fragment>
        {/* Selection bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-primary-container/10 border border-primary/20">
            <span className="font-label-md text-label-md text-primary font-semibold">
              {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-2.5 py-1 rounded-md text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors"
                onClick={() => setSelectedIds(new Set())}
              >
                Limpiar
              </button>
              <button
                type="button"
                className="px-2.5 py-1 rounded-md text-error font-semibold hover:bg-error-container/30 font-label-md text-label-md transition-colors"
                onClick={() => setBulkConfirm(true)}
              >
                Eliminar seleccionadas
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 overflow-hidden flex flex-col transition-all">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1080px]">
              <thead className="bg-surface-container-low/70 border-b border-outline-variant/20 text-on-surface-variant font-overline text-overline uppercase tracking-wider sticky top-0 select-none">
                <tr>
                  <th className="py-3.5 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todas las personas"
                      className="h-4 w-4 appearance-auto accent-primary cursor-pointer rounded border-outline-variant align-middle"
                      checked={allFilteredSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                      }}
                      onChange={() => {
                        if (allFilteredSelected) {
                          setSelectedIds(new Set());
                        } else {
                          setSelectedIds(new Set(displayBorrowers.map((b) => b.id)));
                        }
                      }}
                    />
                  </th>
                  <th className="py-3.5 px-4 font-semibold text-on-surface whitespace-nowrap">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors whitespace-nowrap"
                      onClick={() => toggleSort('name')}
                    >
                      <span className="whitespace-nowrap">Persona / CUIT</span>
                      {sortIcon('name')}
                    </button>
                  </th>
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">
                    <span className="flex items-center gap-1 whitespace-nowrap">Contacto</span>
                  </th>
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">
                    <button
                      type="button"
                      className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors whitespace-nowrap"
                      onClick={() => toggleSort('loans')}
                    >
                      <span className="whitespace-nowrap">Préstamos</span>
                      {sortIcon('loans')}
                    </button>
                  </th>
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">
                    <button
                      type="button"
                      className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors whitespace-nowrap"
                      onClick={() => toggleSort('recovery')}
                    >
                      <span className="whitespace-nowrap">Saldo Recuperado</span>
                      {sortIcon('recovery')}
                    </button>
                  </th>
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">
                    <button
                      type="button"
                      className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors whitespace-nowrap"
                      onClick={() => toggleSort('balance')}
                    >
                      <span className="whitespace-nowrap">Total / Saldo Restante</span>
                      {sortIcon('balance')}
                    </button>
                  </th>
                  <th className="py-3.5 px-4 font-semibold text-right whitespace-nowrap">
                    <span className="whitespace-nowrap">Acciones rápidas</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 text-body-sm font-body-sm">
                {displayBorrowers.map((borrower) => {
                  const initials = getInitials(borrower.firstName, borrower.lastName);
                  const fullName = `${borrower.firstName || ''} ${borrower.lastName || ''}`.trim();
                  const activeLoans = borrower.activeLoanCount || 0;
                  const totalLoans = borrower.loanCount || 0;
                  const hasActive = activeLoans > 0;
                  const isSettled = totalLoans > 0 && !hasActive;
                  const isProspect = totalLoans === 0;
                  const recoveryPct =
                    borrower.recoveryPercent != null ? borrower.recoveryPercent : 0;
                  const recoveredLabel =
                    recoveryPct >= 100 ? '100% saldado' : `${Math.round(recoveryPct)}%`;

                  return (
                    <tr
                      key={borrower.id}
                      className="hover:bg-surface-container-low/50 transition-colors group"
                    >
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${fullName}`}
                          className="h-4 w-4 appearance-auto accent-primary cursor-pointer rounded border-outline-variant align-middle"
                          checked={selectedIds.has(borrower.id)}
                          onChange={() => {
                            const next = new Set(selectedIds);
                            if (next.has(borrower.id)) {
                              next.delete(borrower.id);
                            } else {
                              next.add(borrower.id);
                            }
                            setSelectedIds(next);
                          }}
                        />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div
                              className={`w-10 h-10 rounded-full bg-gradient-to-tr ${avatarGradient(fullName)} flex items-center justify-center text-on-primary font-headline-md text-sm font-semibold shadow-inner`}
                            >
                              {initials}
                            </div>
                            {hasActive && (
                              <span
                                className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-tertiary ring-2 ring-surface-container-lowest"
                                title="Activo"
                              />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="font-label-lg text-label-lg font-semibold text-on-surface group-hover:text-primary hover:text-primary transition-colors cursor-pointer text-left"
                                onClick={() => navigate(`/project/loans/borrowers/${borrower.id}`)}
                              >
                                {fullName}
                              </button>
                              {!isProspect && (
                                <span
                                  className={`material-symbols-outlined text-[16px] ${
                                    hasActive ? 'text-primary' : 'text-tertiary'
                                  }`}
                                  title={hasActive ? 'Legajo verificado' : 'Deuda saldada'}
                                >
                                  {hasActive ? 'verified' : 'check_circle'}
                                </span>
                              )}
                            </div>
                            <span className="font-code-key text-code-key text-outline">
                              CUIT: {borrower.nationalId || '—'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          {borrower.email && (
                            <div className="flex items-center gap-1.5 text-on-surface-variant">
                              <span className="material-symbols-outlined text-[15px] text-outline">
                                mail
                              </span>
                              <span className="truncate max-w-[170px]">{borrower.email}</span>
                              <button
                                type="button"
                                className="text-outline hover:text-primary transition-colors ml-1"
                                title="Copiar email"
                                onClick={() => {
                                  navigator.clipboard.writeText(borrower.email);
                                  toast.success('Email copiado');
                                }}
                              >
                                <span className="material-symbols-outlined text-[13px]">
                                  content_copy
                                </span>
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            {borrower.phone && (
                              <a
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-tertiary-container/15 text-tertiary font-label-md text-[11px] font-semibold hover:bg-tertiary-container/25 transition-colors"
                                href={whatsappLink(borrower.phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <span className="material-symbols-outlined text-[12px]">call</span>
                                <span>{borrower.phone}</span>
                                <span className="material-symbols-outlined text-[11px]">
                                  arrow_outward
                                </span>
                              </a>
                            )}
                            {borrower.address && (
                              <span className="text-[11px] text-outline truncate max-w-[120px]">
                                {borrower.address}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          {hasActive && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-tertiary-container/15 text-tertiary font-label-md text-label-md font-medium w-fit">
                              <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                              {activeLoans} Activo{activeLoans > 1 ? 's' : ''}
                            </span>
                          )}
                          {isSettled && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-container text-on-surface-variant font-label-md text-label-md font-medium w-fit">
                              Sin deuda
                            </span>
                          )}
                          {isProspect && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-container-low text-on-surface-variant font-label-md text-label-md font-medium w-fit">
                              Prospecto
                            </span>
                          )}
                          <span className="text-[11px] text-outline font-label-md">
                            {isProspect
                              ? '0 préstamos totales'
                              : `${totalLoans} ${totalLoans === 1 ? 'préstamo total' : 'préstamos totales'}`}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="w-36 flex flex-col gap-1.5">
                          {isProspect ? (
                            <span className="text-[11px] text-outline italic truncate block">
                              En evaluación de legajo
                            </span>
                          ) : (
                            <React.Fragment>
                              <div className="flex items-center justify-between text-[11px] font-label-md">
                                <span className="text-outline">Progreso</span>
                                <span
                                  className={`font-code-key font-semibold ${recoveryPct >= 70 ? 'text-tertiary' : 'text-primary'}`}
                                >
                                  {recoveredLabel}
                                </span>
                              </div>
                              <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${recoveryPct >= 70 ? 'bg-tertiary' : 'bg-primary'}`}
                                  style={{ width: `${Math.min(recoveryPct, 100)}%` }}
                                />
                              </div>
                            </React.Fragment>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {isProspect ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-outline text-[11px]">Sin operaciones</span>
                            <span className="font-code-key font-medium text-outline text-[12px]">
                              $0 ARS
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {isSettled ? (
                              <React.Fragment>
                                <div className="flex items-center gap-1 font-body-sm">
                                  <span className="text-outline text-[11px]">Estado:</span>
                                  <span className="font-code-key font-bold text-tertiary">
                                    {borrower.remainingBalance
                                      ? `$${Number(borrower.remainingBalance).toLocaleString('es-AR')} ARS`
                                      : '$0,00 ARS'}
                                  </span>
                                </div>
                                <span className="text-[11px] font-code-key text-outline">
                                  Otorgado:{' '}
                                  {borrower.totalHistoricalAmount
                                    ? `$${Number(borrower.totalHistoricalAmount).toLocaleString('es-AR')} ARS`
                                    : '$0 ARS'}
                                </span>
                              </React.Fragment>
                            ) : (
                              <React.Fragment>
                                <div className="flex items-center gap-1 font-body-sm">
                                  <span className="text-outline text-[11px]">Resta:</span>
                                  <span className="font-code-key font-bold text-error">
                                    {borrower.remainingBalance
                                      ? `$${Number(borrower.remainingBalance).toLocaleString('es-AR')} ARS`
                                      : '—'}
                                  </span>
                                </div>
                                <span className="text-[11px] font-code-key text-outline">
                                  Total:{' '}
                                  {borrower.totalHistoricalAmount
                                    ? `$${Number(borrower.totalHistoricalAmount).toLocaleString('es-AR')} ARS`
                                    : '—'}
                                </span>
                              </React.Fragment>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {isProspect ? (
                            <button
                              type="button"
                              className="px-2.5 py-1 rounded-md bg-primary-container text-on-primary font-label-md text-label-md font-semibold hover:bg-primary transition-all inline-flex items-center gap-1 shadow-2xs"
                              onClick={() => navigate('/project/loans/new-loan')}
                            >
                              <span className="material-symbols-outlined text-[15px]">
                                add_circle
                              </span>
                              <span>Crear préstamo</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="px-2.5 py-1 rounded-md bg-surface-container-high text-primary font-label-md text-label-md font-semibold hover:bg-primary hover:text-on-primary transition-all inline-flex items-center gap-1"
                              onClick={() => navigate('/project/loans')}
                            >
                              <span className="material-symbols-outlined text-[15px]">
                                folder_open
                              </span>
                              <span>Legajo</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="w-7 h-7 rounded-md flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                            title="Editar persona"
                            onClick={() => navigate(`/project/loans/borrowers/${borrower.id}`)}
                          >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                          </button>
                          <button
                            type="button"
                            className="w-7 h-7 rounded-md flex items-center justify-center text-outline hover:bg-error-container hover:text-on-error-container transition-colors"
                            title="Eliminar"
                            onClick={() => setDeletingId(borrower.id)}
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </React.Fragment>
    );
  }

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
              onClick={() => navigate('/project/loans/borrowers/new')}
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
              className={`px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors whitespace-nowrap ${
                filter === key
                  ? 'bg-surface-container-high text-primary font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container-low'
              }`}
            >
              {label} ({countForFilter(key)})
            </button>
          ))}
        </div>
        {/* View toggle — hidden on mobile */}
        <div className="hidden md:block h-5 w-px bg-outline-variant/30 mx-1" />
        <div
          className="flex items-center bg-surface-container-low p-1 rounded-lg gap-1 border border-outline-variant/20 shrink-0"
          role="group"
          aria-label="Vista de personas"
        >
          <button
            type="button"
            title="Vista de tarjetas"
            aria-pressed={view === 'cards'}
            onClick={() => {
              setView('cards');
              localStorage.setItem('borrowers-view', 'cards');
            }}
            className={`px-2.5 py-1 rounded-md font-label-md text-label-md flex items-center gap-1.5 transition-colors ${
              view === 'cards'
                ? 'bg-surface-container-lowest text-primary font-semibold shadow-2xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">grid_view</span>
            <span className="hidden sm:inline">Tarjetas</span>
          </button>
          <button
            type="button"
            title="Vista tabular compacta"
            aria-pressed={view === 'table'}
            onClick={() => {
              setView('table');
              localStorage.setItem('borrowers-view', 'table');
            }}
            className={`px-2.5 py-1 rounded-md font-label-md text-label-md flex items-center gap-1.5 transition-colors ${
              view === 'table'
                ? 'bg-surface-container-lowest text-primary font-semibold shadow-2xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">table_rows</span>
            <span className="hidden sm:inline">Tabla</span>
          </button>
        </div>
      </div>

      {/* People Directory */}
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

      {/* Bulk delete confirmation modal */}
      <TailwindConfirmModal
        isOpen={bulkConfirm}
        onClose={() => setBulkConfirm(false)}
        variant="danger"
        title="¿Eliminar legajos seleccionados?"
        message={`¿Eliminar ${selectedIds.size} legajos seleccionados? Esta acción no se puede deshacer.`}
        confirmText={`Eliminar ${selectedIds.size}`}
        cancelText="Cancelar"
        onConfirm={({ close }) => {
          const ids = [...selectedIds];
          Promise.allSettled(ids.map((id) => api.delete(`/api/v1/borrowers/${id}`)))
            .then((results) => {
              const removed = results.filter((r) => r.status === 'fulfilled').length;
              if (removed > 0) {
                toast.success(
                  `${removed} persona${removed !== 1 ? 's' : ''} eliminada${removed !== 1 ? 's' : ''}.`,
                );
              }
              setSelectedIds(new Set());
              setBulkConfirm(false);
              load();
            })
            .finally(close);
        }}
      />
    </div>
  );
}

export default Borrowers;
