/* eslint-disable react/require-default-props */
/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useParams } from 'react-router-dom';

import PageLoader from 'shared/components/PageLoader';
import api from 'shared/utils/api';
import toast from 'shared/utils/toast';

import { useBreadcrumbLeaf } from '../BreadcrumbLeaf';
import { borrowerCopy } from '../copy';
import { formatEsAr } from '../money';
import { avatarGradient, getInitials, whatsappLink } from '../personUtils';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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

const FISCAL_OPTIONS = [
  'Monotributista Cat. D',
  'Relación de dependencia (Exclusivo)',
  'Responsable Inscripto',
  'Monotributista Cat. E o Superior',
];

/* ------------------------------------------------------------------ */
/*  Validation                                                        */
/* ------------------------------------------------------------------ */

const validateBorrower = (values) => {
  const errors = {};
  ['firstName', 'lastName'].forEach((name) => {
    if (String(values[name] || '').trim() === '') errors[name] = borrowerCopy.required;
  });
  return errors;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Format a YYYY-MM-DD date into a short es-AR label like 'Hoy 09:15' or '10 Oct 2026'. */
const formatActivityDate = (dateStr) => {
  if (!dateStr) return '';

  /* Parse date portion only (strip any time part) */
  const parts = String(dateStr).slice(0, 10).split('-');
  if (parts.length !== 3) return String(dateStr);
  const [y, m, d] = parts.map(Number);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return String(dateStr);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dateOnly = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  if (dateOnly === todayStr) {
    /* If the source has a time component, show it */
    const timeMatch = String(dateStr).match(/(\d{2}):(\d{2})/);
    if (timeMatch) {
      return `Hoy ${timeMatch[1]}:${timeMatch[2]}`;
    }
    return 'Hoy';
  }

  const months = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
  ];
  return `${d} ${months[m - 1]} ${y}`;
};

/** Format a date for income certification display: '15 Octubre 2026'. */
const formatEsArLong = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

/** Format a date for settled loan: '14 May 2026'. */
const formatDateShort = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  const months = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

/** Get status pill for a borrower. */
const getStatusPill = (borrower) => {
  const activeLoans = borrower.activeLoanCount || 0;
  const totalLoans = borrower.loanCount || 0;
  if (activeLoans > 0) {
    return `Activo / Con Préstamos (${activeLoans} vigente${activeLoans > 1 ? 's' : ''})`;
  }
  if (totalLoans > 0) return 'Activo / Sin deuda pendiente';
  return 'Prospecto / Sin préstamos';
};

/* ------------------------------------------------------------------ */
/*  Action Dropdown                                                    */
/* ------------------------------------------------------------------ */

function ActionsDropdown({ onClose: parentClose }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        if (parentClose) parentClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, parentClose]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-surface-container-low border border-outline-variant/30 text-on-surface hover:bg-surface-container hover:text-primary transition-colors font-label-md text-label-md font-medium shadow-2xs whitespace-nowrap"
      >
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">more_vert</span>
        <span>Acciones</span>
        <span className="material-symbols-outlined text-[16px] text-outline">expand_more</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-[240px] bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 py-1.5 z-50 flex flex-col">
          <ActionItem icon="download" label="Descargar ficha legajo (PDF)" onClick={() => toast.show({ title: 'Disponible próximamente' })} />
          <ActionItem icon="receipt_long" label="Ver recibos emitidos" onClick={() => navigate('/project/loans')} />
          <ActionItem icon="add" label="Nuevo préstamo" onClick={() => navigate('/project/loans/new-loan')} />
          <div className="h-px bg-outline-variant/20 my-1" />
          <ActionItem icon="description" label="Certificación de haberes" onClick={() => toast.show({ title: 'Disponible próximamente' })} />
          <ActionItem icon="block" label="Suspender legajo" onClick={() => toast.show({ title: 'Disponible próximamente' })} className="text-error" />
        </div>
      )}
    </div>
  );
}

ActionsDropdown.propTypes = {
  onClose: PropTypes.func,
};

function ActionItem({ icon, label, onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-on-surface hover:bg-surface-container-low transition-colors font-label-md text-label-md ${className}`}
    >
      <span className={`material-symbols-outlined text-[18px] ${className || 'text-primary'}`}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

ActionItem.propTypes = {
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  className: PropTypes.string,
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

function PersonDetail() {
  const { borrowerId } = useParams();
  const navigate = useNavigate();
  const isCreate = !borrowerId || borrowerId === 'new';

  const [borrower, setBorrower] = useState(null);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  /* Form state (controlled inputs, not Formik — keeps deps minimal) */
  const [formValues, setFormValues] = useState({ ...EMPTY });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setSubmitting] = useState(false);
  const [dni, setDni] = useState('');
  const [fiscalStatus, setFiscalStatus] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [occupation, setOccupation] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [enabledForLoans, setEnabledForLoans] = useState(true);
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);

  /* Activity filter */
  const [activityFilter, setActivityFilter] = useState('all');

  const fullName = useMemo(() => {
    if (!borrower) return '';
    return `${borrower.firstName || ''} ${borrower.lastName || ''}`.trim();
  }, [borrower]);

  const setLeafLabel = useMemo(() => {
    if (isCreate) return 'Nueva persona';
    return fullName || 'Persona';
  }, [isCreate, fullName]);

  useBreadcrumbLeaf(setLeafLabel);

  /* Load */
  const load = useCallback(() => {
    if (isCreate) {
      setLoading(false);
      return Promise.resolve();
    }
    setLoading(true);
    return api
      .get(`/api/v1/borrowers/${borrowerId}`)
      .then((data) => {
        /* The API might wrap in data.borrower or data.borrowers; adapt */
        const b = data?.borrower || data?.borrowers?.[0] || data;
        setBorrower(b);
        setFormValues({
          firstName: b.firstName || '',
          lastName: b.lastName || '',
          email: b.email || '',
          phone: b.phone || '',
          address: b.address || '',
          nationalId: b.nationalId || '',
          notes: b.notes || '',
        });
        setDni(b.dni || '');
        setFiscalStatus(b.fiscalStatus || '');
        setAltPhone(b.altPhone || '');
        setCity(b.city || '');
        setPostalCode(b.postalCode || '');
        setOccupation(b.occupation || '');
        setMonthlyIncome(b.monthlyIncome || '');
        setEnabledForLoans(b.enabledForLoans !== false);
        setNotifyWhatsApp(b.notifyWhatsApp !== false);
      })
      .catch(() => {
        setLoadError('No pudimos cargar la persona. Intentá de nuevo.');
      })
      .finally(() => setLoading(false));
  }, [borrowerId, isCreate]);

  useEffect(() => {
    setLoadError(null);
    load();
  }, [load]);

  /* Submit */
  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validateBorrower(formValues);
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) {
      const firstId = Object.keys(errs)[0];
      const el = document.getElementById(`pd-${firstId}`);
      if (el) el.focus();
      return;
    }

    setSubmitting(true);

    const payload = PROFILE_FIELDS.concat('notes').reduce(
      (body, name) => ({ ...body, [name]: formValues[name] ?? '' }),
      {},
    );

    const request = isCreate
      ? api.post('/api/v1/borrowers', payload)
      : api.put(`/api/v1/borrowers/${borrowerId}`, payload);

    request
      .then(() => {
        toast.success(isCreate ? 'Persona creada.' : 'Cambios guardados con éxito');
        navigate('/project/loans/borrowers');
      })
      .catch((error) => {
        toast.error(error);
      })
      .finally(() => setSubmitting(false));
  };

  const handleReset = () => {
    if (isCreate) {
      navigate('/project/loans/borrowers');
      return;
    }
    setFormValues({
      firstName: borrower.firstName || '',
      lastName: borrower.lastName || '',
      email: borrower.email || '',
      phone: borrower.phone || '',
      address: borrower.address || '',
      nationalId: borrower.nationalId || '',
      notes: borrower.notes || '',
    });
    setDni(borrower.dni || '');
    setFiscalStatus(borrower.fiscalStatus || '');
    setAltPhone(borrower.altPhone || '');
    setCity(borrower.city || '');
    setPostalCode(borrower.postalCode || '');
    setOccupation(borrower.occupation || '');
    setMonthlyIncome(borrower.monthlyIncome || '');
    setEnabledForLoans(borrower.enabledForLoans !== false);
    setNotifyWhatsApp(borrower.notifyWhatsApp !== false);
    setFormErrors({});
  };

  const handleFieldChange = (field) => (e) => {
    const { value } = e.target;
    setFormValues((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  /* Focus first form field when clicking "Editar legajo" */
  const focusFirstField = () => {
    const el = document.getElementById('pd-firstName');
    if (el) el.focus();
  };

  /* Retry */
  const retry = () => {
    setLoadError(null);
    load();
  };

  /* Loading state */
  if (isLoading) {
    return <PageLoader />;
  }

  /* Error state */
  if (loadError) {
    return (
      <div role="alert" className="flex flex-col items-center gap-space-md py-space-lg">
        <span className="text-error font-body-md text-body-md">{loadError}</span>
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-colors"
          onClick={retry}
        >
          Reintentar
        </button>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Derive display data                                                */
  /* ------------------------------------------------------------------ */

  const initials = getInitials(formValues.firstName, formValues.lastName);
  const nameGradient = avatarGradient(fullName || `${formValues.firstName} ${formValues.lastName}`);
  const incomeCert = borrower?.incomeCertification || {};
  const loans = borrower?.loans || [];
  const activity = borrower?.activity || [];

  const toNum = (v) => Number(v ?? 0) || 0; /* NaN-safe */
  const activeLoans = loans.filter((l) => toNum(l.pendingBalance) > 0);
  const settledLoans = loans.filter((l) => toNum(l.pendingBalance) <= 0);

  /* Activity filter */
  const filteredActivity = (() => {
    if (activityFilter === 'all') return activity;
    if (activityFilter === 'comunicacion') {
      return activity.filter((a) => a.category === 'comunicacion');
    }
    return activity.filter((a) => a.category === activityFilter);
  })();

  const ACTIVITY_CHIPS = [
    { key: 'all', label: 'Todas' },
    { key: 'cobro', label: 'Cobros' },
    { key: 'comunicacion', label: 'Comunicaciones' },
    { key: 'modificacion', label: 'Modificaciones' },
  ];

  const fieldClass = (fieldName) =>
    `h-10 px-3 rounded-lg border-0 bg-[#eff3ff] text-on-surface font-body-md text-body-md shadow-2xs focus:bg-surface-container-lowest transition-all w-full ${
      formErrors[fieldName] ? 'ring-2 ring-inset ring-error/40 bg-surface-container-lowest' : ''
    }`;

  return (
    <div className="flex flex-col gap-space-lg">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md pb-space-xs">
        <div className="flex flex-col gap-space-xs">
          {/* Back link + ID */}
          <div className="flex items-center gap-space-sm">
            <a
              href="/project/loans/borrowers"
              onClick={(e) => {
                e.preventDefault();
                navigate('/project/loans/borrowers');
              }}
              className="inline-flex items-center gap-1 text-primary hover:text-primary-container font-label-md text-label-md transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>Volver a Personas</span>
            </a>
            {!isCreate && borrower && (
              <Fragment>
                <span className="text-outline-variant text-[12px]">•</span>
                <span className="text-outline font-body-sm text-body-sm">
                  ID Legajo #LEG-{String(borrower.id || '').padStart(4, '0')}
                </span>
              </Fragment>
            )}
          </div>

          {/* Title row */}
          <div className="flex flex-wrap items-center gap-space-sm">
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">
              {isCreate ? 'Nueva persona' : fullName}
            </h1>
            {!isCreate && borrower && (
              <Fragment>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high text-primary font-label-md text-label-md font-semibold">
                  <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
                  <span>{getStatusPill(borrower)}</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant font-code-key text-code-key font-medium">
                  <span className="material-symbols-outlined text-[14px]">fingerprint</span>
                  <span>CUIT {borrower.nationalId || ''}</span>
                </div>
              </Fragment>
            )}
          </div>
        </div>

        {/* Action bar (edit only) */}
        {!isCreate && (
          <div className="relative flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={focusFirstField}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-primary text-on-primary hover:bg-primary-container transition-colors font-label-md text-label-md font-medium shadow-2xs whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[18px]">edit_document</span>
              <span>Editar legajo</span>
            </button>
            <ActionsDropdown />
          </div>
        )}
      </div>

      {/* Last saved micro-badge (edit only) */}
      {!isCreate && (
        <div className="flex items-center gap-space-xs text-outline font-body-sm text-body-sm">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-tertiary">cloud_done</span>
            <span>
              Último guardado: <strong className="font-medium text-on-surface-variant">Hoy a las 11:42 hs</strong> por Ezequiel C.
            </span>
          </div>
          <span className="text-outline-variant text-[12px]">•</span>
          <div className="inline-flex items-center gap-1 font-label-md text-label-md text-tertiary font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
            <span>Sincronización BACS: OK</span>
          </div>
        </div>
      )}

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        {/* =============================================================== */}
        {/* LEFT COLUMN                                                      */}
        {/* =============================================================== */}
        <section className="lg:col-span-7 flex flex-col gap-space-lg">
          {/* Form card */}
          <div className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-sm flex flex-col gap-space-lg">
            {/* Card header with avatar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md pb-space-sm">
              <div className="flex items-center gap-space-md">
                <div className="relative group">
                  <div
                    className={`w-16 h-16 rounded-2xl bg-gradient-to-tr ${nameGradient} flex items-center justify-center text-on-primary font-headline-lg text-headline-lg font-bold shadow-md`}
                  >
                    {initials || '??'}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-tertiary-container flex items-center justify-center text-on-tertiary shadow-xs">
                    <span className="material-symbols-outlined text-[12px]">verified</span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">
                    Información Personal y de Contacto
                  </h2>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Datos auditados y vinculados al registro tributario de la República Argentina.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toast.show({ title: 'Disponible próximamente' })}
                className="inline-flex items-center gap-1.5 px-space-sm py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors font-label-md text-label-md"
              >
                <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                <span>Cambiar avatar</span>
              </button>
            </div>

            {/* Form */}
            <form className="flex flex-col gap-space-md" onSubmit={handleSubmit}>
              {/* Row: Nombre / Apellido */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-firstName">
                    Nombre <span className="text-error">*</span>
                  </label>
                  <input
                    id="pd-firstName"
                    name="firstName"
                    className={fieldClass('firstName')}
                    type="text"
                    value={formValues.firstName}
                    onChange={handleFieldChange('firstName')}
                  />
                  {formErrors.firstName && (
                    <span className="text-error font-body-sm text-body-sm">{formErrors.firstName}</span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-lastName">
                    Apellido <span className="text-error">*</span>
                  </label>
                  <input
                    id="pd-lastName"
                    name="lastName"
                    className={fieldClass('lastName')}
                    type="text"
                    value={formValues.lastName}
                    onChange={handleFieldChange('lastName')}
                  />
                  {formErrors.lastName && (
                    <span className="text-error font-body-sm text-body-sm">{formErrors.lastName}</span>
                  )}
                </div>
              </div>

              {/* Row: DNI / Documento  +  CUIT/CUIL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-dni">
                    DNI / Documento <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="pd-dni"
                      className="w-full h-10 px-3 rounded-lg border-0 bg-[#eff3ff] font-code-key text-code-key text-on-surface shadow-2xs focus:bg-surface-container-lowest transition-all"
                      type="text"
                      value={dni}
                      onChange={(e) => setDni(e.target.value)}
                    />
                    <span className="material-symbols-outlined absolute right-3 top-2.5 text-[18px] text-outline">badge</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-nationalId">
                      CUIT / CUIL <span className="text-error">*</span>
                    </label>
                    {!isCreate && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-label-md text-tertiary font-semibold">
                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                        <span>Validado en AFIP</span>
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="pd-nationalId"
                      name="nationalId"
                      className="w-full h-10 px-3 rounded-lg border-0 bg-[#eff3ff] font-code-key text-code-key text-on-surface shadow-2xs focus:bg-surface-container-lowest transition-all"
                      type="text"
                      value={formValues.nationalId}
                      onChange={handleFieldChange('nationalId')}
                    />
                    <span className="material-symbols-outlined absolute right-3 top-2.5 text-[18px] text-tertiary">domain_verification</span>
                  </div>
                </div>
              </div>

              {/* Row: Estado civil / Situación fiscal  +  Correo electrónico */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-fiscalStatus">
                    Estado civil / Situación fiscal
                  </label>
                  <select
                    id="pd-fiscalStatus"
                    className="h-10 px-3 rounded-lg border-0 bg-[#eff3ff] text-on-surface font-body-md text-body-md shadow-2xs focus:bg-surface-container-lowest transition-all cursor-pointer"
                    value={fiscalStatus}
                    onChange={(e) => setFiscalStatus(e.target.value)}
                  >
                    {FISCAL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-email">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <input
                      id="pd-email"
                      name="email"
                      className="w-full h-10 px-3 rounded-lg border-0 bg-[#eff3ff] text-on-surface font-body-md text-body-md shadow-2xs focus:bg-surface-container-lowest transition-all"
                      type="email"
                      value={formValues.email}
                      onChange={handleFieldChange('email')}
                    />
                    <span className="material-symbols-outlined absolute right-3 top-2.5 text-[18px] text-outline">mail</span>
                  </div>
                </div>
              </div>

              {/* Row: Teléfono principal + WhatsApp  /  Teléfono alternativo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-phone">
                    Teléfono principal (Móvil)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <input
                        id="pd-phone"
                        name="phone"
                        className="w-full h-10 px-3 rounded-lg border-0 bg-[#eff3ff] font-code-key text-code-key text-on-surface shadow-2xs focus:bg-surface-container-lowest transition-all"
                        type="tel"
                        value={formValues.phone}
                        onChange={handleFieldChange('phone')}
                      />
                    </div>
                    <a
                      className="w-10 h-10 shrink-0 rounded-lg bg-tertiary text-on-tertiary flex items-center justify-center hover:opacity-90 shadow-sm transition-opacity"
                      href={whatsappLink(formValues.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir chat de WhatsApp"
                    >
                      <span className="material-symbols-outlined text-[20px]">chat</span>
                    </a>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-altPhone">
                    Teléfono laboral / Alternativo
                  </label>
                  <div className="relative">
                    <input
                      id="pd-altPhone"
                      className="w-full h-10 px-3 rounded-lg border-0 bg-[#eff3ff] font-code-key text-code-key text-on-surface shadow-2xs focus:bg-surface-container-lowest transition-all"
                      type="tel"
                      value={altPhone}
                      onChange={(e) => setAltPhone(e.target.value)}
                    />
                    <span className="material-symbols-outlined absolute right-3 top-2.5 text-[18px] text-outline">call</span>
                  </div>
                </div>
              </div>

              {/* Domicilio legal */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-address">
                  Domicilio legal / Calle y número
                </label>
                <div className="relative">
                  <input
                    id="pd-address"
                    name="address"
                    className="w-full h-10 px-3 rounded-lg border-0 bg-[#eff3ff] text-on-surface font-body-md text-body-md shadow-2xs focus:bg-surface-container-lowest transition-all"
                    type="text"
                    value={formValues.address}
                    onChange={handleFieldChange('address')}
                  />
                  <span className="material-symbols-outlined absolute right-3 top-2.5 text-[18px] text-outline">location_on</span>
                </div>
              </div>

              {/* Row: Ciudad + Código Postal */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-city">
                    Ciudad y Provincia
                  </label>
                  <input
                    id="pd-city"
                    className="h-10 px-3 rounded-lg border-0 bg-[#eff3ff] text-on-surface font-body-md text-body-md shadow-2xs focus:bg-surface-container-lowest transition-all w-full"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-postalCode">
                    Código Postal
                  </label>
                  <input
                    id="pd-postalCode"
                    className="h-10 px-3 rounded-lg border-0 bg-[#eff3ff] font-code-key text-code-key text-on-surface shadow-2xs focus:bg-surface-container-lowest transition-all w-full"
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </div>
              </div>

              {/* Row: Ocupación + Ingresos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-occupation">
                    Ocupación / Empleador
                  </label>
                  <div className="relative">
                    <input
                      id="pd-occupation"
                      className="w-full h-10 px-3 rounded-lg border-0 bg-[#eff3ff] text-on-surface font-body-md text-body-md shadow-2xs focus:bg-surface-container-lowest transition-all"
                      type="text"
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                    />
                    <span className="material-symbols-outlined absolute right-3 top-2.5 text-[18px] text-outline">account_balance</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-monthlyIncome">
                    Ingresos declarados mensuales
                  </label>
                  <div className="relative">
                    <input
                      id="pd-monthlyIncome"
                      className="w-full h-10 px-3 rounded-lg border-0 bg-[#eff3ff] font-code-key text-code-key text-on-surface shadow-2xs focus:bg-surface-container-lowest transition-all"
                      type="text"
                      value={monthlyIncome ? `$ ${formatEsAr(monthlyIncome)} ARS` : ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9.,]/g, '');
                        setMonthlyIncome(raw);
                      }}
                    />
                    <span className="material-symbols-outlined absolute right-3 top-2.5 text-[18px] text-tertiary">payments</span>
                  </div>
                </div>
              </div>

              {/* Notas */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="pd-notes">
                    Notas internas / Observaciones de cobranza
                  </label>
                  <span className="font-body-sm text-body-sm text-outline">Solo visible para administradores VIS</span>
                </div>
                <textarea
                  id="pd-notes"
                  name="notes"
                  rows={3}
                  className="p-3 rounded-xl border-0 bg-[#eff3ff] text-on-surface font-body-md text-body-md shadow-2xs focus:bg-surface-container-lowest transition-all w-full"
                  value={formValues.notes}
                  onChange={handleFieldChange('notes')}
                />
              </div>

              {/* Switches */}
              <div className="bg-surface-container-low p-space-md rounded-xl flex flex-col gap-space-sm">
                <label className="flex items-start gap-space-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enabledForLoans}
                    onChange={(e) => setEnabledForLoans(e.target.checked)}
                    className="mt-1 h-4 w-4 appearance-auto accent-primary cursor-pointer rounded"
                  />
                  <div className="flex flex-col">
                    <span className="font-label-lg text-label-lg font-medium text-on-surface">
                      Habilitada para nuevos préstamos (Score Crediticio A+)
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      Permite emitir nuevos mutuos directamente desde el tablero sin autorización adicional.
                    </span>
                  </div>
                </label>
                <div className="h-px bg-surface-container" />
                <label className="flex items-start gap-space-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={notifyWhatsApp}
                    onChange={(e) => setNotifyWhatsApp(e.target.checked)}
                    className="mt-1 h-4 w-4 appearance-auto accent-primary cursor-pointer rounded"
                  />
                  <div className="flex flex-col">
                    <span className="font-label-lg text-label-lg font-medium text-on-surface">
                      Notificar recibos y cuotas por WhatsApp automáticamente
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      Envía la confirmación del pago en PDF y el recordatorio 48 hs antes del vencimiento.
                    </span>
                  </div>
                </label>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-space-sm pt-space-sm">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-space-md h-10 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors font-label-lg text-label-lg"
                >
                  Descartar cambios
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-space-lg h-10 rounded-lg bg-primary-container text-on-primary-container hover:bg-primary transition-colors font-label-lg text-label-lg shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting && (
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  )}
                  {!isSubmitting && <span className="material-symbols-outlined text-[18px]">save</span>}
                  <span>{isCreate ? 'Guardar persona' : 'Guardar cambios de legajo'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Income certification card (edit only) */}
          {!isCreate && (
            <div className="bg-surface-container-low rounded-2xl p-space-md flex items-center justify-between gap-space-md">
              <div className="flex items-center gap-space-sm">
                <div className="w-10 h-10 rounded-xl bg-tertiary-container/15 flex items-center justify-center text-tertiary">
                  <span className="material-symbols-outlined text-[24px]">verified_user</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-lg text-label-lg font-semibold text-on-surface">
                    Certificación de Haberes Actualizada
                  </span>
                  {incomeCert.updatedAt && (
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      Recibo de sueldo cargado el {formatEsArLong(incomeCert.updatedAt)}.
                      {incomeCert.nextUpdate && ` Próxima actualización requerida en ${formatEsArLong(incomeCert.nextUpdate)}.`}
                    </span>
                  )}
                  {!incomeCert.updatedAt && (
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      Sin certificación cargada.
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toast.show({ title: 'Disponible próximamente' })}
                className="px-space-md py-1.5 rounded-lg bg-surface-container-lowest text-primary hover:bg-surface-container-high transition-colors font-label-md text-label-md shadow-2xs whitespace-nowrap"
              >
                Ver recibo PDF
              </button>
            </div>
          )}
        </section>

        {/* =============================================================== */}
        {/* RIGHT COLUMN                                                     */}
        {/* =============================================================== */}
        <section className="lg:col-span-5 flex flex-col gap-space-lg">
          {isCreate ? (
            /* Create mode placeholder */
            <div className="bg-surface-container-lowest rounded-2xl p-space-xl shadow-sm flex flex-col items-center justify-center text-center gap-space-sm">
              <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-outline">
                <span className="material-symbols-outlined text-[32px]">folder_open</span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-surface">Guardá el legajo para ver préstamos vinculados y actividad.</h3>
            </div>
          ) : (
            <Fragment>
              {/* Préstamos Vinculados */}
              <div className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-sm flex flex-col gap-space-md">
                <div className="flex flex-col gap-space-sm">
                  <div className="flex items-center gap-2">
                    <h2 className="font-headline-md text-headline-md font-semibold text-on-surface whitespace-nowrap">
                      Préstamos Vinculados
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-md text-label-md text-on-surface-variant font-medium">
                      {loans.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/project/loans/new-loan')}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-space-md py-2 rounded-lg bg-primary-container text-on-primary-container hover:bg-primary transition-colors font-label-md text-label-md font-medium shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    <span>Nuevo préstamo</span>
                  </button>
                </div>

                <div className="flex flex-col gap-space-md">
                  {/* Active loans */}
                  {activeLoans.map((loan) => (
                    <div
                      key={loan.id}
                      className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-md hover:shadow-md transition-shadow relative overflow-hidden border border-outline-variant/30"
                    >
                      <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-primary" />
                      <div className="flex flex-col gap-1.5 pl-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-primary-container/20 text-primary font-label-md text-label-md font-semibold tracking-tight">
                            En curso / Activo
                          </span>
                          <span className="font-code-key text-code-key text-outline bg-surface-container-lowest/80 px-2 py-0.5 rounded border border-outline-variant/20">
                            Tasa: 24% fija
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-0.5 min-w-0">
                          <span className="font-label-lg text-label-lg font-bold text-on-surface hover:text-primary transition-colors flex items-center gap-1 group min-w-0">
                            <span className="truncate">Mutuo {loan.concept || ''}</span>
                            <span className="shrink-0">#{loan.number || ''}</span>
                            <span className="material-symbols-outlined text-[15px] text-outline shrink-0">open_in_new</span>
                          </span>
                          <span className="font-code-key text-body-sm text-outline font-medium shrink-0 whitespace-nowrap">
                            #LEG-{String(borrower?.id || '').padStart(4, '0')}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-space-md p-space-sm bg-surface-container-lowest/70 rounded-lg ml-1.5 border border-outline-variant/20">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-body-sm text-body-sm text-on-surface-variant">Monto Original</span>
                          <span className="font-code-key text-code-key font-bold text-on-surface">
                            $ {formatEsAr(loan.amount)} {loan.currency || 'ARS'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 items-end text-right">
                          <span className="font-body-sm text-body-sm text-error font-medium">Saldo pendiente de cobro</span>
                          <span className="font-code-key text-code-key font-bold text-error text-[13px]">
                            $ {formatEsAr(loan.pendingBalance)} {loan.currency || 'ARS'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-space-xs pl-1.5">
                        <div className="flex justify-between items-center font-body-sm text-body-sm">
                          <span className="text-on-surface-variant font-medium">
                            {loan.installmentsPaid || 0} de {loan.installmentsCount || 0} cuotas pagadas
                          </span>
                          <span className="font-semibold text-primary">
                            {Math.round(Number(loan.progressPercent)) || 0}% completado
                          </span>
                        </div>
                        <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(loan.progressPercent || 0, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between font-body-sm text-body-sm pt-0.5">
                          <span className="text-outline">Cuota mensual: $ {formatEsAr(loan.installmentAmount)} {loan.currency || 'ARS'}</span>
                          <span className="font-medium text-on-surface-variant">{loan.installmentsCount || 0} cuotas</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Settled loans */}
                  {settledLoans.length > 0 && (
                    <div className="flex flex-col gap-space-sm pt-space-xs border-t border-outline-variant/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-label-lg text-label-lg font-semibold text-on-surface">Historial de Saldados</span>
                          <span className="px-2 py-0.5 rounded-full bg-surface-container text-[11px] font-code-key font-semibold text-outline">
                            {settledLoans.length}
                          </span>
                        </div>
                        <span className="text-body-sm text-outline text-[12px]">Todos cancelados</span>
                      </div>

                      {settledLoans.map((loan) => (
                        <div
                          key={loan.id}
                          className="bg-surface-container-low/50 border border-outline-variant/30 rounded-xl p-space-md flex flex-col gap-space-sm hover:shadow-md transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-tertiary-fixed/30 border border-tertiary-fixed/30 text-tertiary text-[11px] font-label-md font-semibold">
                              <span className="material-symbols-outlined text-[13px]">check_circle</span>
                              100% Saldado
                            </span>
                            <span className="font-code-key text-code-key text-outline font-medium">Saldo: $ 0,00 {loan.currency || 'ARS'}</span>
                          </div>
                          <div className="flex items-center justify-between pt-0.5 min-w-0">
                            <span className="font-label-lg text-label-lg font-bold text-on-surface flex items-center gap-1 min-w-0">
                              <span className="truncate">Mutuo {loan.concept || ''}</span>
                              <span className="shrink-0">#{loan.number || ''}</span>
                            </span>
                            <span className="font-code-key text-code-key font-bold text-on-surface shrink-0 whitespace-nowrap">
                              $ {formatEsAr(loan.amount)} {loan.currency || 'ARS'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm">
                            <div className="flex items-center gap-1 text-outline">
                              <span className="material-symbols-outlined text-[15px]">event_available</span>
                              <span>Finalizado: {formatDateShort(loan.date)}</span>
                            </div>
                            <span className="text-[11px] font-code-key text-outline">Total cancelado</span>
                          </div>
                          <div className="pt-1 border-t border-outline-variant/20 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => toast.show({ title: 'Disponible próximamente' })}
                              className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md font-medium text-center shadow-2xs"
                            >
                              <span className="material-symbols-outlined text-[16px]">description</span>
                              <span>Libre Deuda (PDF)</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Registro de Actividad y Auditoría */}
              <div className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-sm flex flex-col gap-space-md">
                <div className="flex flex-col gap-space-xs">
                  <div className="flex items-center justify-between">
                    <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">
                      Registro de Actividad y Auditoría
                    </h2>
                    <span className="material-symbols-outlined text-[18px] text-outline">history</span>
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Trazabilidad de pagos, cambios de legajo y comunicaciones salientes.
                  </span>
                </div>

                {/* Filter chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {ACTIVITY_CHIPS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActivityFilter(key)}
                      className={`px-2.5 py-1 rounded-full font-label-md text-label-md transition-colors font-medium ${
                        activityFilter === key
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Timeline */}
                <div className="flex flex-col gap-space-md relative pl-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-surface-container">
                  {filteredActivity.length === 0 && (
                    <div className="flex flex-col items-center gap-space-sm py-space-md text-center">
                      <span className="material-symbols-outlined text-[28px] text-outline">history_toggle_off</span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        {activityFilter === 'comunicacion'
                          ? 'Sin comunicaciones registradas.'
                          : 'Sin actividad registrada.'}
                      </span>
                    </div>
                  )}

                  {filteredActivity.slice(0, 5).map((item) => {
                    const isCobro = item.category === 'cobro';
                    const isModificacion = item.category === 'modificacion';
                    /* Compose title from structured fields */
                    let composedTitle = item.title || '';
                    let composedDetail = item.detail || '';
                    if (isCobro && item.amount !== undefined) {
                      /* If cuota exceeds cuotaTotal or cuotaTotal is 0/missing,
                         omit the cuota fragment entirely — extra/over payments
                         would otherwise show "Cuota 7/6" (nonsense). */
                      const showCuota = item.cuota != null && item.cuotaTotal != null && item.cuotaTotal > 0 && item.cuota <= item.cuotaTotal;
                      const cuotaFragment = showCuota
                        ? ` Cuota ${item.cuota}/${item.cuotaTotal}`
                        : '';
                      composedTitle = `Pago registrado${cuotaFragment} ($ ${formatEsAr(item.amount)} ${item.currency || 'ARS'})`;
                    } else if (isModificacion && item.amount !== undefined) {
                      /* Compose detail from structured fields so the amount is
                         formatted in es-AR locale (e.g. $ 460.000,00). */
                      const installmentLabel = item.installments > 0 ? ` en ${item.installments} cuotas mensuales` : '';
                      composedDetail = `Otorgado por $ ${formatEsAr(item.amount)}${installmentLabel}.`;
                    }
                    return (
                      <div key={item.id} className="relative flex flex-col gap-1">
                        <div
                          className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center shadow-2xs ${
                            isCobro
                              ? 'bg-tertiary-container text-on-tertiary'
                              : 'bg-inverse-surface text-inverse-on-surface'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[12px]">
                            {isCobro ? 'payments' : 'assignment_turned_in'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-label-md text-label-md font-semibold text-on-surface">
                            {composedTitle}
                          </span>
                          <span className="font-body-sm text-body-sm text-outline">
                            {formatActivityDate(item.date)}
                          </span>
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug">
                          {composedDetail}
                        </p>
                      </div>
                    );
                  })}

                  {filteredActivity.length > 5 && (
                    <div className="text-center pt-space-xs">
                      <button
                        type="button"
                        onClick={() => toast.show({ title: 'Disponible próximamente' })}
                        className="inline-flex items-center gap-1.5 text-primary hover:text-primary-container font-label-md text-label-md font-medium transition-colors"
                      >
                        <span>Ver historial completo de auditoría ({filteredActivity.length} eventos)</span>
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Fragment>
          )}
        </section>
      </div>
    </div>
  );
}

export default PersonDetail;
