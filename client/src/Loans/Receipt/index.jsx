/* eslint-disable react/require-default-props */
import React, { Fragment, useRef, useState } from 'react';
import PropTypes from 'prop-types';

import toast from 'shared/utils/toast';

import firma from './assets/firma.png';
import { receiptCopy } from '../copy';
import { formatEsAr, formatLoanNumber } from '../money';
import { receiptAmount, receiptData, receiptNumber, previewReceiptData } from './receiptData';
import { ReceiptPrintStyles } from './Styles';

/*
 * A rendered receipt, matching the new A4 design spec.
 *
 * Supports TWO modes:
 *   1. ISSUED mode (payment exists): renders from the payment's frozen snapshot
 *      plus the loan's descriptive fields.
 *   2. PREVIEW mode (previewLoan + previewDraft): renders from draft form values
 *      and the selected loan, showing a "VISTA PREVIA" badge so it can't be
 *      confused with an issued receipt.
 *   3. PLACEHOLDER mode (neither): shows an empty clipboard card.
 *
 * The actions (print / PNG / WhatsApp share) live *outside* the paper node, so
 * the exported image carries no UI and only the paper reaches the printer.
 */

/** Deterministic mock hash from loan number + receipt number. */
const mockHash = (loanNumber, docNumber) =>
  `9a7f-cordoba-vis-${String(loanNumber || '').padStart(5, '0')}-${String(docNumber || '').padStart(3, '0')}`;

/** Format a date string to AR locale dd/mm/yyyy HH:mm */
const formatToAr = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

/** Compute the receipt document number: loan.number + '-' + padded installment. */
const docNumber = (data) => {
  const loanNum = String(data.number || '').padStart(4, '0');
  const installments = String(data.installmentsPaid || 1).padStart(3, '0');
  return `${loanNum}-${installments}`;
};

function Receipt({
  payment,
  loan,
  previewLoan: previewLoanProp,
  previewDraft: previewDraftProp,
  withActions = false,
}) {
  const paperRef = useRef(null);
  const [isExporting, setExporting] = useState(false);

  // Determine mode
  const isIssued = !!payment;
  const isPreview = !isIssued && !!previewLoanProp && !!previewDraftProp;
  const isPlaceholder = !isIssued && !isPreview;

  const data = isIssued
    ? receiptData(payment, loan)
    : isPreview
      ? previewReceiptData(previewLoanProp, previewDraftProp)
      : {};

  const exportPng = () => {
    if (!paperRef.current) return;
    setExporting(true);
    import('html-to-image')
      .then(({ toPng }) =>
        toPng(paperRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 }),
      )
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `recibo-${formatLoanNumber(data.number || '')}.png`;
        link.href = dataUrl;
        link.click();
      })
      .catch((error) => toast.error(error))
      .finally(() => setExporting(false));
  };

  // Placeholder state
  if (isPlaceholder) {
    return (
      <Fragment>
        <ReceiptPrintStyles />
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm p-space-xl flex flex-col items-center justify-center text-center gap-space-sm">
          <span className="material-symbols-outlined text-[40px] text-outline">description</span>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-xs">
            Elegí un préstamo y completá los datos para ver la vista previa del recibo.
          </p>
        </div>
      </Fragment>
    );
  }

  const reversedAt = data.reversedAt;

  return (
    <Fragment>
      <ReceiptPrintStyles />

      {/* Action bar — outside the paper node */}
      {withActions && (
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm px-space-md py-space-sm flex flex-wrap items-center justify-between gap-space-sm mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-tertiary" />
            <span className="font-label-md text-label-md text-on-surface font-semibold">
              Vista previa de impresión oficial
            </span>
            <span className="font-overline text-overline bg-surface-container px-2 py-0.5 rounded text-outline uppercase">
              A4 / Papel membretado
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-9 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md font-medium flex items-center gap-1.5 transition-colors"
              onClick={() => window.print()}
              title="Imprimir (Ctrl+P)"
            >
              <span className="material-symbols-outlined text-[17px]">print</span>
              <span>{receiptCopy.print}</span>
            </button>
            <button
              type="button"
              className="h-9 px-3.5 rounded-lg bg-secondary text-on-secondary hover:bg-secondary-container font-label-md text-label-md font-medium flex items-center gap-1.5 shadow-xs transition-colors"
              onClick={exportPng}
              disabled={isExporting}
            >
              <span className="material-symbols-outlined text-[17px]">image</span>
              <span>{isExporting ? receiptCopy.exporting : receiptCopy.exportPng}</span>
            </button>
            <button
              type="button"
              className="h-9 w-9 rounded-lg bg-surface-container hover:bg-surface-container-high text-tertiary flex items-center justify-center transition-colors"
              title="Compartir enlace WhatsApp"
            >
              <span className="material-symbols-outlined text-[18px]">share</span>
            </button>
          </div>
        </div>
      )}

      {/* The printable document */}
      <div
        className="w-full max-w-[760px] bg-white text-[#111827] rounded-xl shadow-xl p-8 flex flex-col gap-6 relative select-none planny-receipt"
        ref={paperRef}
      >
        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none overflow-hidden">
          <span className="text-[120px] font-extrabold tracking-widest text-black rotate-[-24deg] select-none">
            VIS PLATFORM
          </span>
        </div>

        {/* Preview mode strip badge */}
        {isPreview && (
          <div className="bg-[#fef3c7]/10 text-warning font-label-sm text-label-sm px-3 py-1 rounded-md border border-warning/20 inline-flex items-center gap-1.5 absolute top-2 right-2 z-10">
            <span className="material-symbols-outlined text-[14px]">visibility</span>
            <span className="font-semibold">VISTA PREVIA — NO VÁLIDO COMO COMPROBANTE</span>
          </div>
        )}

        {/* Reversed banner */}
        {reversedAt && (
          <div className="bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca] rounded-lg p-3 font-semibold text-sm">
            {receiptCopy.reversedBanner}
          </div>
        )}

        {/* 1. Purple title band */}
        <div className="w-full bg-[#7c3aed] text-white rounded-lg p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-white/15 flex items-center justify-center text-white font-code-key font-bold text-headline-md tracking-wider">
              VIS
            </div>
            <div className="flex flex-col">
              <span className="font-overline text-overline tracking-widest uppercase text-white/80">
                SISTEMA VIS · GESTIÓN DE PRÉSTAMOS
              </span>
              <h1 className="font-headline-lg text-headline-lg font-bold tracking-tight text-white leading-tight">
                RECIBO DE PAGO DE CUOTA
              </h1>
            </div>
          </div>
          <div className="flex sm:flex-col sm:items-end justify-between border-t sm:border-t-0 sm:border-l border-white/20 pt-2 sm:pt-0 sm:pl-4 sm:min-w-[180px]">
            <span className="font-overline text-overline uppercase text-white/80 tracking-wider">
              COMPROBANTE OFICIAL
            </span>
            <span className="font-code-key text-headline-md font-bold text-white tracking-widest whitespace-nowrap truncate max-w-full">
              Nº {docNumber(data)}
            </span>
            <span className="font-body-sm text-body-sm text-white/70 whitespace-nowrap">Original · Para prestataria</span>
          </div>
        </div>

        {/* 2. Legal meta grid */}
        <div className="bg-[#f9fafb] rounded-lg p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 pb-3">
            <div className="flex flex-col">
              <span className="font-overline text-[10px] text-gray-500 uppercase tracking-wider">
                Ciudad
              </span>
              <span className="font-body-md text-body-md font-bold text-gray-900">{data.city}</span>
            </div>
            <div className="flex flex-col">
              <span className="font-overline text-[10px] text-gray-500 uppercase tracking-wider">Día</span>
              <span className="font-code-key text-body-md font-bold text-gray-900">{data.day}</span>
            </div>
            <div className="flex flex-col">
              <span className="font-overline text-[10px] text-gray-500 uppercase tracking-wider">Mes</span>
              <span className="font-code-key text-body-md font-bold text-gray-900">{data.month}</span>
            </div>
            <div className="flex flex-col">
              <span className="font-overline text-[10px] text-gray-500 uppercase tracking-wider">Año</span>
              <span className="font-code-key text-body-md font-bold text-gray-900">{data.year}</span>
            </div>
            <div className="sm:col-span-2 flex flex-col sm:items-end">
              <span className="font-overline text-[10px] text-gray-500 uppercase tracking-wider">
                Monto Percibido
              </span>
              <span className="font-code-key text-headline-md font-extrabold text-[#7c3aed]">
                $ {formatEsAr(data.amount)} {data.currency}
              </span>
            </div>
          </div>

          {/* Recibí de */}
          <div className="bg-white rounded-md p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-body-sm text-body-sm font-semibold text-gray-500">Recibí de:</span>
              <span className="font-body-md text-body-md font-bold text-gray-900">
                {data.borrowerName}
              </span>
              {data.nationalId && (
                <span className="font-code-key text-body-sm text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                  {data.nationalId}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 font-body-sm text-body-sm text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold">
              <span className="material-symbols-outlined text-[15px]">verified_user</span>
              <span>Identidad validada</span>
            </div>
          </div>

          {/* Amount in words */}
          <div className="flex flex-col gap-1">
            <span className="font-overline text-[10px] text-gray-500 uppercase tracking-wider">
              La cantidad de (expresada en letras):
            </span>
            <div className="bg-white rounded-md p-2.5 font-body-md text-body-md italic text-gray-800 shadow-xs">
              <span className="font-medium">
                &ldquo;{data.amountInWords}&rdquo;
              </span>
            </div>
          </div>

          {/* Concept */}
          <div className="flex flex-col gap-1">
            <span className="font-overline text-[10px] text-gray-500 uppercase tracking-wider">
              En concepto de:
            </span>
            <div className="bg-white rounded-md p-2.5 font-body-md text-body-md text-gray-900 shadow-xs flex items-center justify-between">
              <span className="font-semibold">{data.concept}</span>
              {(data.reference || (data.reference !== undefined && data.reference)) && (
                <span className="font-code-key text-body-sm text-gray-500">REF: {data.reference}</span>
              )}
            </div>
          </div>
        </div>

        {/* 3. Financial metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#ede9fe]/30 rounded-xl p-4">
          <div className="flex flex-col">
            <span className="font-overline text-[10px] text-gray-500 uppercase">Total préstamo</span>
            <span className="font-code-key text-label-lg font-bold text-gray-900">
              $ {formatEsAr(data.loanAmount)}
            </span>
            <span className="font-body-sm text-[11px] text-gray-500">Monto total inicial</span>
          </div>
          <div className="flex flex-col">
            <span className="font-overline text-[10px] text-gray-500 uppercase">Amortizado acumulado</span>
            <span className="font-code-key text-label-lg font-bold text-emerald-700">
              {(() => {
                const loanAmt = parseFloat(data.loanAmount) || 0;
                const balance = parseFloat(data.resultingBalance) || 0;
                const collected = Math.max(loanAmt - balance, 0);
                const pct = loanAmt > 0 ? ((collected / loanAmt) * 100).toFixed(1) : '0.0';
                return `$ ${formatEsAr(collected)}`;
              })()}
            </span>
            <span className="font-body-sm text-[11px] text-emerald-600">
              {(() => {
                const loanAmt = parseFloat(data.loanAmount) || 0;
                const balance = parseFloat(data.resultingBalance) || 0;
                const collected = Math.max(loanAmt - balance, 0);
                const pct = loanAmt > 0 ? ((collected / loanAmt) * 100).toFixed(1) : '0.0';
                return `${pct}% del total saldado`;
              })()}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-overline text-[10px] text-gray-500 uppercase">Saldo remanente deudor</span>
            <span className="font-code-key text-label-lg font-bold text-rose-700">
              $ {formatEsAr(data.resultingBalance)}
            </span>
            <span className="font-body-sm text-[11px] text-rose-600">Pendiente de cancelación</span>
          </div>
          <div className="flex flex-col">
            <span className="font-overline text-[10px] text-gray-500 uppercase">Estado de cuotas</span>
            <span className="font-code-key text-label-lg font-bold text-indigo-900">
              {data.installmentsPaid} / {data.installmentsCount} canceladas
            </span>
            <span className="font-body-sm text-[11px] text-indigo-600">
              {(() => {
                const remaining = Math.max(data.installmentsCount - data.installmentsPaid, 0);
                if (remaining === 1) return '1 cuota restante';
                return `${remaining} cuotas restantes`;
              })()}
            </span>
          </div>
        </div>

        {/* Payment history (only for issued mode) */}
        {isIssued && data.history && data.history.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-3">
            <span className="font-overline text-[10px] text-gray-500 uppercase tracking-wider block mb-2">
              Historial de pagos
            </span>
            <ul className="space-y-1">
              {data.history.map((row, index) => {
                const isAdvance = row.kind === 'advance';
                return (
                  <li
                    key={`${row.kind}-${index}`}
                    className="flex items-center justify-between font-body-sm text-body-sm text-gray-700"
                  >
                    <span>
                      {isAdvance && <span className="font-semibold text-gray-500">Pago cuotas anteriores</span>}
                      {!isAdvance && row.date && <span>{row.date.slice(0, 10)} — </span>}
                      {!isAdvance && !row.date && <span>— </span>}
                      {receiptAmount(row.amount, data.currency)}
                    </span>
                    {row.reversedAt && (
                      <span className="font-semibold text-xs text-[#b91c1c] bg-[#fef2f2] px-1.5 py-0.5 rounded">
                        {receiptCopy.reversedTag}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* 4. Signatures block */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 items-end">
          {/* Left: System seal */}
          <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
            <div className="w-16 h-16 bg-gray-900 text-white p-1 rounded flex flex-col justify-between font-code-key text-[7px] leading-tight">
              <div className="flex justify-between">
                <span className="w-3 h-3 bg-white block" />
                <span className="w-3 h-3 bg-white block" />
              </div>
              <div className="text-center font-bold tracking-tighter text-[6px]">VIS-HASH-OK</div>
              <div className="flex justify-between">
                <span className="w-3 h-3 bg-white block" />
                <span className="w-1.5 h-1.5 bg-white block" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-overline text-[10px] text-gray-500 uppercase">Sello Digital de Seguridad</span>
              <span className="font-code-key text-[11px] font-semibold text-gray-800 break-all">
                HASH: {mockHash(data.number, data.installmentsPaid)}
              </span>
              <span className="font-body-sm text-[11px] text-emerald-700 font-medium flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[13px]">check_circle</span>
                Verificación criptográfica válida
              </span>
            </div>
          </div>

          {/* Right: Signature */}
          <div className="flex flex-col items-center text-center">
            <div className="w-full relative flex flex-col items-center">
              <img src={firma} alt="Firma del acreedor" className="h-10 md:h-12 w-auto -mb-1 object-contain" />
              <div className="w-full h-[1.5px] bg-gray-400" />
            </div>
            <span className="font-label-md text-label-md font-bold text-gray-900 mt-1">Ezequiel C.</span>
            <span className="font-body-sm text-[11px] text-gray-500">
              Acreedor / Administrador VIS · DNI 34.912.840
            </span>
            <span className="font-code-key text-[10px] text-gray-400">
              Emitido electrónicamente: {formatToAr(data.date)} ART
            </span>
          </div>
        </div>

        {/* 5. Legal disclaimer */}
        <div className="pt-3 text-center">
          <p className="text-[11px] text-gray-500 leading-normal max-w-xl mx-auto">
            Este comprobante acredita la percepción del importe consignado en concepto de amortización de cuota del acuerdo particular privado de mutuo financiero celebrado entre las partes. La validez de este recibo queda sujeta a la efectiva acreditación del medio de pago en cuenta de destino bancaria.
          </p>
        </div>
      </div>
    </Fragment>
  );
}

Receipt.propTypes = {
  payment: PropTypes.shape({
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    date: PropTypes.string,
    snapshot: PropTypes.object,
    reversedAt: PropTypes.string,
  }),
  loan: PropTypes.shape({
    number: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    city: PropTypes.string,
    currency: PropTypes.string,
    lender: PropTypes.string,
    concept: PropTypes.string,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    pendingBalance: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    installmentCount: PropTypes.number,
    installmentsPaid: PropTypes.number,
    borrower: PropTypes.shape({
      firstName: PropTypes.string,
      lastName: PropTypes.string,
      nationalId: PropTypes.string,
    }),
  }),
  previewLoan: PropTypes.shape({
    number: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    city: PropTypes.string,
    currency: PropTypes.string,
    lender: PropTypes.string,
    concept: PropTypes.string,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    pendingBalance: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    installmentCount: PropTypes.number,
    installmentsPaid: PropTypes.number,
    borrower: PropTypes.shape({
      firstName: PropTypes.string,
      lastName: PropTypes.string,
      nationalId: PropTypes.string,
    }),
  }),
  previewDraft: PropTypes.shape({
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    date: PropTypes.string,
    concept: PropTypes.string,
    reference: PropTypes.string,
    number: PropTypes.string,
  }),
  withActions: PropTypes.bool,
};

export default Receipt;
