import React, { Fragment } from 'react';
import PropTypes from 'prop-types';

import { Avatar, Select, Icon } from 'shared/components';

import { SectionTitle } from '../Styles';
import { User, Username } from './Styles';

/* eslint-disable react/require-default-props */

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
  projectUsers: PropTypes.array.isRequired,
  isReadonly: PropTypes.bool,
};

const ProjectBoardIssueDetailsAssigneesReporter = ({
  issue,
  updateIssue,
  projectUsers,
  isReadonly = false,
}) => {
  const getUserById = (userId) => projectUsers.find((user) => user.id === userId);

  const userOptions = projectUsers.map((user) => ({ value: user.id, label: user.name }));

  if (isReadonly) {
    return (
      <Fragment>
        <SectionTitle>Assignees</SectionTitle>
        {issue.userIds && issue.userIds.length > 0 ? (
          issue.userIds.map((userId) => {
            const user = getUserById(userId);
            return user ? renderUser(user, true) : null;
          })
        ) : (
          <div style={{ fontSize: '15px', color: '#5E6C84', padding: '4px 0' }}>Unassigned</div>
        )}

        <SectionTitle>Reporter</SectionTitle>
        {issue.reporterId && getUserById(issue.reporterId) ? (
          renderUser(getUserById(issue.reporterId), true)
        ) : (
          <div style={{ fontSize: '15px', color: '#5E6C84', padding: '4px 0' }}>No reporter</div>
        )}
      </Fragment>
    );
  }

  return (
    <Fragment>
      <SectionTitle>Assignees</SectionTitle>
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
          renderUser(getUserById(userId), true, removeOptionValue)
        }
        renderOption={({ value: userId }) => renderUser(getUserById(userId), false)}
      />

      <SectionTitle>Reporter</SectionTitle>
      <Select
        variant="empty"
        dropdownWidth={343}
        withClearValue={false}
        name="reporter"
        value={issue.reporterId}
        options={userOptions}
        onChange={(userId) => updateIssue({ reporterId: userId })}
        renderValue={({ value: userId }) => renderUser(getUserById(userId), true)}
        renderOption={({ value: userId }) => renderUser(getUserById(userId))}
      />
    </Fragment>
  );
};

const renderUser = (user, isSelectValue, removeOptionValue) => (
  <User
    key={user.id}
    $isSelectValue={isSelectValue}
    $withBottomMargin={!!removeOptionValue}
    onClick={() => removeOptionValue && removeOptionValue()}
  >
    <Avatar avatarUrl={user.avatarUrl} name={user.name} size={24} />
    <Username>{user.name}</Username>
    {removeOptionValue && <Icon type="close" top={1} />}
  </User>
);

ProjectBoardIssueDetailsAssigneesReporter.propTypes = propTypes;

export default ProjectBoardIssueDetailsAssigneesReporter;
