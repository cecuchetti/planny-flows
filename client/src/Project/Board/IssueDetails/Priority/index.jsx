import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { IssuePriority } from 'shared/constants/issues';
import { Select, IssuePriorityIcon } from 'shared/components';

import { SectionTitle } from '../Styles';
import { Priority, Label } from './Styles';

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
};

const ProjectBoardIssueDetailsPriority = ({ issue, updateIssue }) => {
  const { t } = useTranslation();
  const options = Object.values(IssuePriority).map(priority => ({
    value: priority,
    label: t(`issuePriorities.${priority}`),
  }));
  const renderPriorityItem = (priority, isValue) => (
    <Priority isValue={isValue}>
      <IssuePriorityIcon priority={priority} />
      <Label>{t(`issuePriorities.${priority}`)}</Label>
    </Priority>
  );
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
        onChange={priority => updateIssue({ priority })}
        renderValue={({ value: priority }) => renderPriorityItem(priority, true)}
        renderOption={({ value: priority }) => renderPriorityItem(priority)}
      />
    </Fragment>
  );
};

ProjectBoardIssueDetailsPriority.propTypes = propTypes;

export default ProjectBoardIssueDetailsPriority;
