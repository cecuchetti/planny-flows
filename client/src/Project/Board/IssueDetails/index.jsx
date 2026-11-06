import React, { Fragment, useState } from 'react';
import PropTypes from 'prop-types';

import api from 'shared/utils/api';
import useApi from 'shared/hooks/api';
import {
  PageError,
  CopyLinkButton,
  AboutTooltip,
  Avatar,
} from 'shared/components';
import useCurrentUser from 'shared/hooks/currentUser';

import Loader from './Loader';
import Type from './Type';
import Delete from './Delete';
import Title from './Title';
import Description from './Description';
import Comments from './Comments';
import Status from './Status';
import AssigneesReporter from './AssigneesReporter';
import Priority from './Priority';
import EstimateTracking from './EstimateTracking';
import Dates from './Dates';
import TimeEntryModal from '../../MyJiraIssues/TimeEntryModal';

const JIRA_BASE_URL = process.env.REACT_APP_JIRA_BASE_URL;

const propTypes = {
  issueId: PropTypes.string.isRequired,
  projectUsers: PropTypes.array.isRequired,
  fetchProject: PropTypes.func.isRequired,
  updateLocalProjectIssues: PropTypes.func.isRequired,
  modalClose: PropTypes.func.isRequired,
};

function ProjectBoardIssueDetails({
  issueId,
  projectUsers,
  fetchProject,
  updateLocalProjectIssues,
  modalClose,
}) {
  const [{ data, error, setLocalData }, fetchIssue] = useApi.get(`/issues/${issueId}`);
  const [isTimeEntryOpen, setTimeEntryOpen] = useState(false);
  const $logWorkCardRef = React.useRef(null);
  const { currentUser } = useCurrentUser();

  if (!data) return <Loader />;
  if (error) return <PageError />;

  const { issue } = data;
  const isReadonly = issue.readonly === true;
  const externalKey = issue.externalKey || issue.external_key;
  const canShowExternalActions = isReadonly && externalKey;
  const canShowJiraLink = canShowExternalActions && JIRA_BASE_URL;

  const updateLocalIssueDetails = (fields) =>
    setLocalData((currentData) => ({ issue: { ...currentData.issue, ...fields } }));

  const updateIssue = (updatedFields) => {
    api.optimisticUpdate(`/issues/${issueId}`, {
      updatedFields,
      currentFields: issue,
      setLocalData: (fields) => {
        updateLocalIssueDetails(fields);
        updateLocalProjectIssues(issue.id, fields);
      },
    });
  };

  const handleTimeEntrySaved = () => {
    setTimeEntryOpen(false);
    fetchIssue();
  };

  const openLogWork = () => {
    setTimeEntryOpen(true);
    // Expand the card and scroll it into view after render.
    setTimeout(() => {
      if ($logWorkCardRef.current) {
        $logWorkCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  };

  return (
    <Fragment>
      {/* Modal Header Action Bar */}
      <div className="px-space-xl pt-space-lg pb-space-md flex items-center justify-between bg-surface-container-lowest">
        {/* Left: Issue Type Pill + optional category tag */}
        <div className="flex items-center gap-space-sm">
          <Type issue={issue} updateIssue={updateIssue} isReadonly={isReadonly} />
          {issue.category && (
            <span
              data-testid="issue-category-tag"
              className="font-overline text-overline uppercase tracking-wider text-on-surface-variant bg-surface-container px-2 py-0.5 rounded"
            >
              {issue.category}
            </span>
          )}
        </div>

        {/* Right Action Controls — uniform gap, no ad-hoc margins */}
        <div className="flex items-center gap-2" data-testid="issue-details-header-actions">
          <AboutTooltip
            renderLink={(linkProps) => (
              <button
                type="button"
                {...linkProps}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors font-label-md text-label-md font-medium"
              >
                <span className="material-symbols-outlined text-[18px]">rate_review</span>
                <span>Give feedback</span>
              </button>
            )}
          />
          <CopyLinkButton className="w-9 h-9 rounded-lg" />
          {!isReadonly && (
            <Delete issue={issue} fetchProject={fetchProject} modalClose={modalClose} />
          )}
          {canShowExternalActions && (
            <button
              type="button"
              onClick={openLogWork}
              title={`Log time to ${externalKey}`}
              className="flex items-center gap-1.5 px-space-md py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary-container shadow-sm active:scale-[0.98] transition-all ring-2 ring-primary/20"
            >
              <span className="material-symbols-outlined text-[18px]">timer</span>
              <span>Log Time</span>
            </button>
          )}
          {canShowJiraLink && (
            <a
              href={`https://${JIRA_BASE_URL}/browse/${externalKey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-2 text-primary font-label-md text-label-md font-semibold hover:underline transition-all"
            >
              <span>View in Jira</span>
              <span className="material-symbols-outlined text-[16px]">north_east</span>
            </a>
          )}
          {/* M3 divider separating issue actions from user/session controls */}
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-outline-variant/60" />
          {currentUser && (
            <span data-testid="header-user-avatar" title={currentUser.name || 'You'}>
              <Avatar avatarUrl={currentUser.avatarUrl} name={currentUser.name} size={28} />
            </span>
          )}
          <button
            type="button"
            onClick={modalClose}
            title="Close dialog"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>
      </div>

      {/* Jira Synchronization Strip Banner */}
      {isReadonly && (
        <div className="w-full bg-[#ede9fe] px-space-xl py-2.5 flex items-center justify-between text-[#6d28d9]">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[18px]">sync_alt</span>
            <span className="font-label-md text-label-md font-semibold tracking-tight">
              Read-only — Jira synchronized issue
            </span>
            <span className="font-body-sm text-body-sm text-[#6d28d9]/80 hidden md:inline">
              · Fields update automatically from Jira
            </span>
          </div>
          {externalKey && (
            <div className="flex items-center gap-space-xs bg-[#ffffff] px-2.5 py-0.5 rounded-full shadow-xs">
              <span className="font-code-key text-code-key font-bold text-[#6d28d9]">
                {externalKey}
              </span>
              <span className="material-symbols-outlined text-[14px]">cloud_done</span>
            </div>
          )}
        </div>
      )}

      {/* Modal Body Split Layout */}
      <div className="grid grid-cols-12 gap-gutter px-space-xl py-space-lg max-h-[calc(85vh-120px)] overflow-y-auto">
        {/* LEFT COLUMN */}
        <div className="col-span-8 flex flex-col gap-space-xl pr-space-md">
          <Title issue={issue} updateIssue={updateIssue} isReadonly={isReadonly} />
          <Description issue={issue} updateIssue={updateIssue} isReadonly={isReadonly} />
          <Comments issue={issue} fetchIssue={fetchIssue} />
        </div>

        {/* RIGHT COLUMN */}
        <div className="col-span-4 flex flex-col gap-space-lg pl-space-md bg-surface-container-low/30 p-space-md rounded-2xl">
          <Status issue={issue} updateIssue={updateIssue} isReadonly={isReadonly} />
          <Priority issue={issue} updateIssue={updateIssue} isReadonly={isReadonly} />
          <AssigneesReporter
            issue={issue}
            updateIssue={updateIssue}
            projectUsers={projectUsers}
            isReadonly={isReadonly}
          />
          {isReadonly && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container text-on-surface-variant font-label-md text-label-md">
              <span className="material-symbols-outlined text-[16px] text-primary">autorenew</span>
              <span className="font-medium">Automated Sync Enabled</span>
            </div>
          )}
          {canShowExternalActions && (
            <div
              ref={$logWorkCardRef}
              className="bg-surface-container-lowest rounded-2xl shadow-xs border border-surface-container-high/60 overflow-hidden transition-all duration-200"
            >
              {/* Interactive Header Bar */}
              <button
                type="button"
                onClick={() => setTimeEntryOpen(!isTimeEntryOpen)}
                aria-expanded={isTimeEntryOpen}
                className="w-full p-space-md flex items-center justify-between hover:bg-surface-container-low/40 transition-colors text-left focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">
                    add_alarm
                  </span>
                  <span className="font-label-md text-label-md font-bold uppercase tracking-wider text-on-surface">
                    Log Work
                  </span>
                  <span className="font-code-key text-code-key px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant/80 font-semibold ml-1">
                    {externalKey}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <span
                    className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${
                      isTimeEntryOpen ? '' : 'rotate-180'
                    }`}
                  >
                    expand_less
                  </span>
                </div>
              </button>

              {/* Collapsed Preview / Quick-Action Summary Row */}
              {!isTimeEntryOpen && (
                <div className="px-space-md pb-space-md pt-0 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setTimeEntryOpen(true)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors text-primary font-label-md text-label-md font-semibold"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">add_circle</span>
                      <span>+ Log time</span>
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant/70 font-normal">
                      Registrar tiempo en {externalKey}
                    </span>
                  </button>
                </div>
              )}

              {/* Collapsible Form Content */}
              {isTimeEntryOpen && (
                <div className="flex flex-col gap-space-md px-space-md pb-space-md pt-0 text-left border-t border-surface-container-high/40 mt-0">
                  <TimeEntryModal
                    issue={{
                      key: externalKey,
                      summary: issue.title,
                      status: issue.status,
                    }}
                    onClose={() => setTimeEntryOpen(false)}
                    onSaved={handleTimeEntrySaved}
                    inline
                  />
                </div>
              )}
            </div>
          )}

          <EstimateTracking issue={issue} updateIssue={updateIssue} isReadonly={isReadonly} />
          <Dates issue={issue} />
        </div>
      </div>

      {/* Footer Bar */}
      <div className="px-space-xl py-3 bg-surface-container-low/50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-on-surface-variant font-body-sm text-body-sm">
          <span className="material-symbols-outlined text-[16px] text-tertiary">lock_reset</span>
          <span>
            {isReadonly
              ? 'Changes synchronized with remote ledger automatically'
              : 'Changes saved automatically'}
          </span>
        </div>
        <div className="flex items-center gap-space-sm">
          <button
            type="button"
            onClick={modalClose}
            className="px-4 py-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-label-md text-label-md font-medium transition-colors"
          >
            Close Esc
          </button>
        </div>
      </div>
    </Fragment>
  );
}

ProjectBoardIssueDetails.propTypes = propTypes;

export default ProjectBoardIssueDetails;
