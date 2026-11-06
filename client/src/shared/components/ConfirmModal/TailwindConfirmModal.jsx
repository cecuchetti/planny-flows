import React, { useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';

/* eslint-disable react/require-default-props */

const propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(['danger', 'warning', 'primary']),
  title: PropTypes.string.isRequired,
  message: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  confirmText: PropTypes.string.isRequired,
  cancelText: PropTypes.string,
  icon: PropTypes.string,
};

const ICON_MAP = {
  danger: { icon: 'warning', bg: 'bg-error-container', text: 'text-error' },
  warning: { icon: 'warning', bg: 'bg-amber-100', text: 'text-amber-700' },
  primary: { icon: 'info', bg: 'bg-primary-fixed', text: 'text-primary' },
};

const BUTTON_MAP = {
  danger: 'bg-error hover:bg-[#93000a] text-on-error',
  warning: 'bg-amber-600 hover:bg-amber-700 text-white',
  primary: 'bg-primary hover:bg-primary-container text-on-primary',
};

function FocusTrap({ containerRef, isActive, children }) {
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key !== 'Tab' || !containerRef.current || !isActive) return;
      const focusables = containerRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [containerRef, isActive],
  );

  useEffect(() => {
    if (!isActive) return;
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, isActive, handleKeyDown]);

  return children;
}

FocusTrap.propTypes = {
  containerRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  isActive: PropTypes.bool.isRequired,
  children: PropTypes.node.isRequired,
};

const TailwindConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  variant = 'danger',
  title,
  message,
  confirmText,
  cancelText = 'Cancelar',
  icon,
}) => {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [isSubmitting, setSubmitting] = React.useState(false);

  const styles = ICON_MAP[variant] || ICON_MAP.danger;
  const buttonStyles = BUTTON_MAP[variant] || BUTTON_MAP.danger;
  const iconName = icon || styles.icon;

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const focusable = modalRef.current.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable) focusable.focus();
  }, [isOpen]);

  const handleConfirm = useCallback(() => {
    setSubmitting(true);
    onConfirm({
      close: () => {
        setSubmitting(false);
        onClose();
      },
    });
  }, [onConfirm, onClose]);

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleEscape = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-space-md"
      onKeyDown={handleEscape}
    >
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="absolute inset-0 bg-[#111827]/60 backdrop-blur-sm"
        onClick={handleBackdropClick}
      />

      {/* Modal container */}
      <FocusTrap containerRef={modalRef} isActive={isOpen}>
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className="
            relative w-full max-w-md
            bg-surface-container-lowest rounded-xl p-space-lg
            shadow-xl
            animate-[fadeIn_200ms_ease-out]
            flex flex-col gap-space-md
          "
        >
          {/* Close button */}
          <button
            type="button"
            aria-label="Cerrar"
            className="
              absolute top-3 right-3 w-8 h-8 rounded-lg
              flex items-center justify-center
              text-outline hover:text-on-surface hover:bg-surface-container-low
              transition-colors
            "
            onClick={onClose}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>

          {/* Icon circle */}
          <div
            className={`w-12 h-12 rounded-xl ${styles.bg} ${styles.text} flex items-center justify-center shrink-0 shadow-inner`}
          >
            <span className="material-symbols-outlined text-[26px]">{iconName}</span>
          </div>

          {/* Title */}
          <h2 className="font-headline-md text-headline-md text-on-surface font-bold pr-6">
            {title}
          </h2>

          {/* Message */}
          {message && (
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              {message}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-space-sm pt-space-xs">
            <button
              type="button"
              className="
                h-10 px-5 rounded-lg
                bg-surface-container hover:bg-surface-container-high
                text-on-surface font-label-lg text-label-lg
                transition-colors
              "
              onClick={onClose}
            >
              {cancelText}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              className={`
                h-10 px-5 rounded-lg font-label-lg text-label-lg
                shadow-sm transition-all flex items-center gap-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${buttonStyles}
              `}
              onClick={handleConfirm}
            >
              {isSubmitting && (
                <span className="material-symbols-outlined text-[18px] animate-spin">
                  progress_activity
                </span>
              )}
              {confirmText}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>,
    document.getElementById('root') || document.body,
  );
};

TailwindConfirmModal.propTypes = propTypes;

export default TailwindConfirmModal;
