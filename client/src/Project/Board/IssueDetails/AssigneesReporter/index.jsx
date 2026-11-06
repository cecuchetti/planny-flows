/* eslint-disable react/require-default-props -- optional props are read, never required */

import React, { Fragment } from 'react';
import PropTypes from 'prop-types';

import { Avatar, Select } from 'shared/components';

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
  projectUsers: PropTypes.array.isRequired,
  isReadonly: PropTypes.bool,
};

function ProjectBoardIssueDetailsAssigneesReporter({
  issue,
  updateIssue,
  projectUsers,
  isReadonly = false,
}) {
  const getUserById = (userId) => projectUsers.find((user) => user.id === userId);

  const userOptions = projectUsers.map((user) => ({ value: user.id, label: user.name }));

  const renderUserRow = (user, showChevron = false, onRemove = null) => (
    <div className="flex items-center justify-between p-2 rounded-xl bg-surface-container-lowest shadow-xs">
      <div className="flex items-center gap-2.5">
        <Avatar avatarUrl={user?.avatarUrl} name={user?.name} size={28} />
        <div className="flex flex-col">
          <span className="font-label-md text-label-md font-semibold text-on-surface">
            {user?.name || 'Unknown'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {showChevron && (
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
            expand_more
          </span>
        )}
        {onRemove && (
          <button
            type="button"
            className="flex items-center justify-center p-0.5 rounded-full hover:bg-surface-container-high transition-colors"
            title="Remove"
            onClick={onRemove}
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant hover:text-error">
              close
            </span>
          </button>
        )}
      </div>
    </div>
  );

  // For readonly mode: just render assignee and reporter info
  if (isReadonly) {
    return (
      <Fragment>
        {/* Assignee(s) */}
        <div className="flex flex-col gap-1.5">
          <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
            Assignee{issue.userIds && issue.userIds.length > 1 ? 's' : ''}
          </span>
          {issue.userIds && issue.userIds.length > 0 ? (
            issue.userIds.map((userId) => {
              const user = getUserById(userId);
              return user ? renderUserRow(user, false) : null;
            })
          ) : (
            <div className="text-body-md text-on-surface-variant/70 px-2 py-1">Unassigned</div>
          )}
        </div>
        {/* Reporter */}
        <div className="flex flex-col gap-1.5">
          <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
            Reporter
          </span>
          {issue.reporterId && getUserById(issue.reporterId) ? (
            renderUserRow(getUserById(issue.reporterId), false)
          ) : (
            <div className="text-body-md text-on-surface-variant/70 px-2 py-1">No reporter</div>
          )}
        </div>
      </Fragment>
    );
  }

  return (
    <Fragment>
      {/* Assignee(s) */}
      <div className="flex flex-col gap-1.5">
        <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
          Assignee{issue.userIds && issue.userIds.length > 1 ? 's' : ''}
        </span>
        <Select
          isMulti
          variant="empty"
          dropdownWidth={343}
          placeholder="Unassigned"
          name="assignees"
          value={issue.userIds}
          options={userOptions}
          onChange={(userIds) => {
            updateIssue({ userIds, users: userIds.map(getUserById) });
          }}
          renderValue={({ value: userId, removeOptionValue }) =>
            renderUserRow(getUserById(userId), true, removeOptionValue)
          }
          renderOption={({ value: userId }) => (
            <div className="flex items-center gap-2.5 px-2 py-1.5 cursor-pointer hover:bg-surface-container rounded-lg">
              <Avatar
                avatarUrl={getUserById(userId)?.avatarUrl}
                name={getUserById(userId)?.name}
                size={28}
              />
              <span className="font-label-md text-label-md">{getUserById(userId)?.name}</span>
            </div>
          )}
        />
      </div>
      {/* Reporter */}
      <div className="flex flex-col gap-1.5">
        <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
          Reporter
        </span>
        <Select
          variant="empty"
          dropdownWidth={343}
          withClearValue={false}
          name="reporter"
          value={issue.reporterId}
          options={userOptions}
          onChange={(userId) => updateIssue({ reporterId: userId })}
          renderValue={({ value: userId }) => renderUserRow(getUserById(userId), false)}
          renderOption={({ value: userId }) => (
            <div className="flex items-center gap-2.5 px-2 py-1.5 cursor-pointer hover:bg-surface-container rounded-lg">
              <Avatar
                avatarUrl={getUserById(userId)?.avatarUrl}
                name={getUserById(userId)?.name}
                size={28}
              />
              <span className="font-label-md text-label-md">{getUserById(userId)?.name}</span>
            </div>
          )}
        />
      </div>
    </Fragment>
  );
}

ProjectBoardIssueDetailsAssigneesReporter.propTypes = propTypes;

export default ProjectBoardIssueDetailsAssigneesReporter;
