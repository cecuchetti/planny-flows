import React, { Fragment, useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import useOnOutsideClick from 'shared/hooks/onOutsideClick';
import useOnEscapeKeyDown from 'shared/hooks/onEscapeKeyDown';

import { ScrollOverlay, ClickableOverlay, StyledModal, CloseButton, CloseIcon } from './Styles';

/* eslint-disable react/require-default-props */

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const getFocusables = (el) =>
  el ? Array.from(el.querySelectorAll(FOCUSABLE_SELECTOR)) : [];

function Modal({
  className = undefined,
  testid = 'modal',
  variant = 'center',
  width = 600,
  withCloseIcon = true,
  isOpen: propsIsOpen = undefined,
  onClose: tellParentToClose = () => {},
  renderLink = () => {},
  renderContent,
}) {
  const { t } = useTranslation();
  const [stateIsOpen, setStateOpen] = useState(false);
  const isControlled = typeof propsIsOpen === 'boolean';
  const isOpen = isControlled ? propsIsOpen : stateIsOpen;

  const $modalRef = useRef();
  const $clickableOverlayRef = useRef();
  const previousActiveElementRef = useRef(null);

  const closeModal = useCallback(() => {
    if (!isControlled) {
      setStateOpen(false);
    } else {
      tellParentToClose();
    }
  }, [isControlled, tellParentToClose]);

  useOnOutsideClick($modalRef, isOpen, closeModal, $clickableOverlayRef);
  useOnEscapeKeyDown(isOpen, closeModal);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    previousActiveElementRef.current = document.activeElement;
    return () => {
      document.body.style.overflow = 'visible';
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !$modalRef.current) return;
    $modalRef.current.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !$modalRef.current) return;
    const el = $modalRef.current;
    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = getFocusables(el);
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
    };
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const portalTarget = document.getElementById('root') || document.body;

  return (
    <Fragment>
      {!isControlled && renderLink({ open: () => setStateOpen(true) })}

      {isOpen &&
        ReactDOM.createPortal(
          <ScrollOverlay>
            <ClickableOverlay $variant={variant} ref={$clickableOverlayRef}>
              <StyledModal
                className={className}
                $variant={variant}
                $width={width}
                data-testid={testid}
                ref={$modalRef}
                role="dialog"
                aria-modal="true"
                aria-label={t('common.dialog')}
                tabIndex={-1}
              >
                {withCloseIcon && (
                  <CloseButton
                    type="button"
                    $variant={variant}
                    onClick={closeModal}
                    aria-label={t('common.closeDialog')}
                  >
                    <CloseIcon type="close" />
                  </CloseButton>
                )}
                {renderContent({ close: closeModal })}
              </StyledModal>
            </ClickableOverlay>
          </ScrollOverlay>,
          portalTarget,
        )}
    </Fragment>
  );
};

const propTypes = {
  className: PropTypes.string,
  testid: PropTypes.string,
  variant: PropTypes.oneOf(['center', 'aside']),
  width: PropTypes.number,
  withCloseIcon: PropTypes.bool,
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  renderLink: PropTypes.func,
  renderContent: PropTypes.func.isRequired,
};

Modal.propTypes = propTypes;

export default Modal;
