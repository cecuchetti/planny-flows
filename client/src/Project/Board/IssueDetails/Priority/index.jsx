import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { IssuePriority } from 'shared/constants/issues';
import { Select, IssuePriorityIcon } from 'shared/components';

import { SectionTitle } from '../Styles';
import { Priority, Label } from './Styles';

/* eslint-disable react/require-default-props */

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
  isReadonly: PropTypes.bool,
};

const ProjectBoardIssueDetailsPriority = ({ issue, updateIssue, isReadonly = false }) => {
  const { t } = useTranslation();
  const options = Object.values(IssuePriority).map((priority) => ({
    value: priority,
    label: t(`issuePriorities.${priority}`),
  }));
  const renderPriorityItem = (priority, isValue) => (
    <Priority $isValue={isValue} style={isReadonly ? { cursor: 'default' } : undefined}>
      <IssuePriorityIcon priority={priority} />
      <Label>{t(`issuePriorities.${priority}`) || priority}</Label>
    </Priority>
  );

  if (isReadonly) {
    return (
      <Fragment>
        <SectionTitle>{t('issue.priorityLabel')}</SectionTitle>
        {renderPriorityItem(issue.priority, true)}
      </Fragment>
    );
  }

  return (
    <Fragment>
      <SectionTitle>{t('issue.priorityLabel')}</SectionTitle>
      <Select
        variant="empty"
        withClearValue={false}
        dropdownWidth={343}
        name="priority"
        value={issue.priority}
        options={options}
        onChange={(priority) => updateIssue({ priority })}
        renderValue={({ value: priority }) => renderPriorityItem(priority, true)}
        renderOption={({ value: priority }) => renderPriorityItem(priority)}
      />
    </Fragment>
  );
};

ProjectBoardIssueDetailsPriority.propTypes = propTypes;

export default ProjectBoardIssueDetailsPriority;
