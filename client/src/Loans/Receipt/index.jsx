/* eslint-disable react/require-default-props */
import React, { Fragment, useRef, useState } from 'react';
import PropTypes from 'prop-types';

import Button from 'shared/components/Button';
import toast from 'shared/utils/toast';

import { receiptCopy } from '../copy';
import { amountWithCurrency, formatDate, formatLoanNumber } from '../money';
import { Row } from '../Styles';
import { receiptData } from './receiptData';
import {
  HistoryAmount,
  HistoryLabel,
  HistoryList,
  HistoryRow,
  HistoryTitle,
  ReceiptField,
  ReceiptLabel,
  ReceiptMeta,
  ReceiptPaper,
  ReceiptPrintStyles,
  ReceiptTitle,
  ReceiptValue,
  ReceiptWords,
  ReversedBanner,
  ReversedChip,
  SignatureBox,
  SignatureCaption,
} from './Styles';

/*
 * A rendered receipt, from a payment's snapshot plus the loan's descriptive
 * fields.
 *
 * The actions (print / PNG) live *outside* the paper node, so the exported image
 * carries no UI and only the paper reaches the printer. The image dependency is
 * imported lazily, inside this Loans-only subtree, so the flag-off build still
 * drops it with the rest of the chunk.
 */
function Receipt({ payment, loan, withActions = false }) {
  const paperRef = useRef(null);
  const [isExporting, setExporting] = useState(false);

  const data = receiptData(payment, loan);

  const exportPng = () => {
    if (!paperRef.current) return;
    setExporting(true);
    import('html-to-image')
      .then(({ toPng }) => toPng(paperRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 }))
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `recibo-${formatLoanNumber(data.number)}.png`;
        link.href = dataUrl;
        link.click();
      })
      .catch((error) => toast.error(error))
      .finally(() => setExporting(false));
  };

  return (
    <Fragment>
      <ReceiptPrintStyles />
      {withActions && (
        <Row>
          <Button type="button" onClick={() => window.print()}>
            {receiptCopy.print}
          </Button>
          <Button type="button" variant="primary" isWorking={isExporting} onClick={exportPng}>
            {isExporting ? receiptCopy.exporting : receiptCopy.exportPng}
          </Button>
        </Row>
      )}

      <ReceiptPaper className="planny-receipt" ref={paperRef}>
        <ReceiptTitle>{receiptCopy.title}</ReceiptTitle>

        {data.reversedAt && <ReversedBanner>{receiptCopy.reversedBanner}</ReversedBanner>}

        <ReceiptMeta>
          <span>
            {data.city}
            {data.city && data.date ? ', ' : ''}
            {formatDate(data.date)}
          </span>
          <span>
            {receiptCopy.number} {formatLoanNumber(data.number)}
          </span>
        </ReceiptMeta>

        <ReceiptField>
          <ReceiptLabel>{receiptCopy.receivedAmount}:</ReceiptLabel>
          <ReceiptValue>{amountWithCurrency(data.amount, data.currency)}</ReceiptValue>
        </ReceiptField>

        <ReceiptField>
          <ReceiptLabel>{receiptCopy.paidTo}:</ReceiptLabel>
          <ReceiptValue>{data.lender}</ReceiptValue>
        </ReceiptField>

        <ReceiptField>
          <ReceiptLabel>{receiptCopy.concept}:</ReceiptLabel>
          <ReceiptValue>{data.concept}</ReceiptValue>
        </ReceiptField>

        <ReceiptWords>
          {receiptCopy.amountInWords}: {data.amountInWords}
        </ReceiptWords>

        <ReceiptField>
          <ReceiptLabel>{receiptCopy.paidBy}:</ReceiptLabel>
          <ReceiptValue>{data.borrowerName}</ReceiptValue>
        </ReceiptField>

        <SignatureBox aria-label={receiptCopy.signature} />
        <SignatureCaption>{receiptCopy.approved}</SignatureCaption>
        <SignatureCaption>{receiptCopy.signature}</SignatureCaption>

        <ReceiptField>
          <ReceiptLabel>{receiptCopy.resultingBalance}:</ReceiptLabel>
          <ReceiptValue>{amountWithCurrency(data.resultingBalance, data.currency)}</ReceiptValue>
        </ReceiptField>

        <HistoryTitle>{receiptCopy.history}</HistoryTitle>
        <HistoryList>
          {data.history.map((row, index) => (
            <HistoryRow key={`${row.kind}-${index}`}>
              <HistoryLabel>{row.kind === 'advance' ? receiptCopy.advanceLine : ''}</HistoryLabel>
              <HistoryAmount>
                {amountWithCurrency(row.amount, data.currency)}
                {row.reversedAt && <ReversedChip>{receiptCopy.reversedTag}</ReversedChip>}
              </HistoryAmount>
            </HistoryRow>
          ))}
        </HistoryList>
      </ReceiptPaper>
    </Fragment>
  );
}

Receipt.propTypes = {
  payment: PropTypes.shape({
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    date: PropTypes.string,
    snapshot: PropTypes.object,
  }).isRequired,
  loan: PropTypes.shape({
    number: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    city: PropTypes.string,
    currency: PropTypes.string,
    lender: PropTypes.string,
    concept: PropTypes.string,
    borrower: PropTypes.shape({
      firstName: PropTypes.string,
      lastName: PropTypes.string,
    }),
  }).isRequired,
  withActions: PropTypes.bool,
};

export default Receipt;
