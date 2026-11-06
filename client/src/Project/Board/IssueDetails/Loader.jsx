import React from 'react';
import PropTypes from 'prop-types';

/* eslint-disable react/require-default-props */

const propTypes = {
  /** Optional className to let the parent control sizing/layout */
  className: PropTypes.string,
};

function IssueDetailsLoader({ className = undefined }) {
  return (
    <div className={className} data-testid="issue-details-loader">
      {/* Skeleton container mimicking the modal body */}
      <div className="flex flex-col gap-space-lg">
        {/* Header strip skeleton */}
        <div className="flex items-center justify-between px-space-xl pt-space-lg pb-space-md">
          <div className="flex items-center gap-space-sm">
            <div className="h-6 w-24 animate-pulse bg-surface-container-low/50 rounded" />
            <div className="h-3.5 w-28 animate-pulse bg-surface-container-low/50 rounded" />
          </div>
          <div className="flex items-center gap-space-sm">
            <div className="h-9 w-9 animate-pulse bg-surface-container-low/50 rounded-lg" />
            <div className="h-9 w-9 animate-pulse bg-surface-container-low/50 rounded-lg" />
            <div className="h-9 w-9 animate-pulse bg-surface-container-low/50 rounded-lg" />
          </div>
        </div>

        {/* Split content skeleton */}
        <div className="grid grid-cols-12 gap-gutter px-space-xl py-space-lg">
          {/* Left column */}
          <div className="col-span-8 flex flex-col gap-space-xl pr-space-md">
            <div className="h-8 w-3/4 animate-pulse bg-surface-container-low/50 rounded" />
            <div className="flex flex-col gap-space-sm">
              <div className="h-3.5 w-24 animate-pulse bg-surface-container-low/50 rounded" />
              <div className="h-20 w-full animate-pulse bg-surface-container-low/50 rounded-xl" />
            </div>
            <div className="flex flex-col gap-space-md">
              <div className="h-3.5 w-24 animate-pulse bg-surface-container-low/50 rounded" />
              <div className="h-12 w-full animate-pulse bg-surface-container-low/50 rounded-2xl" />
              <div className="h-16 w-full animate-pulse bg-surface-container-low/50 rounded-2xl" />
            </div>
          </div>

          {/* Right column */}
          <div className="col-span-4 flex flex-col gap-space-lg pl-space-md bg-surface-container-low/30 p-space-md rounded-2xl">
            <div className="h-10 w-full animate-pulse bg-surface-container-low/50 rounded-xl" />
            <div className="h-9 w-28 animate-pulse bg-surface-container-low/50 rounded-xl" />
            <div className="h-11 w-full animate-pulse bg-surface-container-low/50 rounded-xl" />
            <div className="h-11 w-full animate-pulse bg-surface-container-low/50 rounded-xl" />
            <div className="h-24 w-full animate-pulse bg-surface-container-low/50 rounded-2xl" />
          </div>
        </div>

        {/* Footer strip skeleton */}
        <div className="px-space-xl py-3 flex items-center justify-between">
          <div className="h-4 w-64 animate-pulse bg-surface-container-low/50 rounded" />
          <div className="h-9 w-24 animate-pulse bg-surface-container-low/50 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

IssueDetailsLoader.propTypes = propTypes;

export default IssueDetailsLoader;
