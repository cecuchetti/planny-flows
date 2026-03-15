import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { IssueStatus } from 'shared/constants/issues';
import { Select, Icon } from 'shared/components';

import { SectionTitle } from '../Styles';
import { Status } from './Styles';

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
};

const ProjectBoardIssueDetailsStatus = ({ issue, updateIssue }) => {
  const { t } = useTranslation();
  const options = Object.values(IssueStatus).map(status => ({
    value: status,
    label: t(`issueStatuses.${status}`),
  }));
  return (
    <Fragment>
      <SectionTitle>{t('issue.statusLabel')}</SectionTitle>
      <Select
        variant="empty"
        dropdownWidth={343}
        withClearValue={false}
        name="status"
        value={issue.status}
        options={options}
        onChange={status => updateIssue({ status })}
        renderValue={({ value: status }) => (
          <Status isValue color={status}>
            <div>{t(`issueStatuses.${status}`)}</div>
            <Icon type="chevron-down" size={18} />
          </Status>
        )}
        renderOption={({ value: status }) => (
          <Status color={status}>{t(`issueStatuses.${status}`)}</Status>
        )}
      />
    </Fragment>
  );
};

ProjectBoardIssueDetailsStatus.propTypes = propTypes;

export default ProjectBoardIssueDetailsStatus;
