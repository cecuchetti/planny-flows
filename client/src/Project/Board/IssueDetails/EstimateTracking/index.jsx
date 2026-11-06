import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import isNil from 'lodash/isNil';

import { InputDebounced, Modal, Button } from 'shared/components';

import TrackingWidget from './TrackingWidget';

/* eslint-disable react/require-default-props */

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
  isReadonly: PropTypes.bool,
};

function ProjectBoardIssueDetailsEstimateTracking({ issue, updateIssue, isReadonly = false }) {
  const renderHourInput = (fieldName) => (
    <InputDebounced
      placeholder="Number"
      filter={/^\d{0,6}$/}
      value={isNil(issue[fieldName]) ? '' : issue[fieldName]}
      disabled={isReadonly}
      onChange={(stringValue) => {
        const value = stringValue.trim() ? Number(stringValue) : null;
        updateIssue({ [fieldName]: value });
      }}
    />
  );

  return (
    <Fragment>
      {/* Original estimate */}
      <div className="flex flex-col gap-1.5">
        <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
          Original estimate (hours)
        </span>
        <div className="w-full">{renderHourInput('estimate')}</div>
      </div>

      {/* Time tracking */}
      <Modal
        testid="modal:tracking"
        width={400}
        renderLink={(modal) => (
          <div
            onClick={isReadonly ? undefined : modal.open}
            className={isReadonly ? 'cursor-default' : 'cursor-pointer'}
          >
            <TrackingWidget issue={issue} />
          </div>
        )}
        renderContent={(modal) => (
          <div className="p-5 flex flex-col gap-space-md" data-testid="modal:tracking-content">
            <div className="font-label-lg text-label-lg font-bold text-on-surface">
              Time tracking
            </div>
            <TrackingWidget issue={issue} />
            <div className="flex gap-space-md">
              <div className="flex flex-col gap-1.5 flex-1">
                <span className="font-label-md text-label-md font-semibold text-on-surface-variant">
                  Time spent (hours)
                </span>
                {renderHourInput('timeSpent')}
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <span className="font-label-md text-label-md font-semibold text-on-surface-variant">
                  Time remaining (hours)
                </span>
                {renderHourInput('timeRemaining')}
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={modal.close}>
                Done
              </Button>
            </div>
          </div>
        )}
      />
    </Fragment>
  );
}

ProjectBoardIssueDetailsEstimateTracking.propTypes = propTypes;

export default ProjectBoardIssueDetailsEstimateTracking;
