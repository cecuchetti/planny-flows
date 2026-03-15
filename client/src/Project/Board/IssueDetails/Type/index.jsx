import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { IssueType } from 'shared/constants/issues';
import { IssueTypeIcon, Select } from 'shared/components';

import { TypeButton, Type, TypeLabel } from './Styles';

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
};

const ProjectBoardIssueDetailsType = ({ issue, updateIssue }) => {
  const { t } = useTranslation();
  const options = Object.values(IssueType).map(type => ({
    value: type,
    label: t(`issueTypes.${type}`),
  }));
  return (
    <Select
      variant="empty"
      dropdownWidth={150}
      withClearValue={false}
      name="type"
      value={issue.type}
      options={options}
      onChange={type => updateIssue({ type })}
      renderValue={({ value: type }) => (
        <TypeButton variant="empty" icon={<IssueTypeIcon type={type} />}>
          {`${t(`issueTypes.${type}`)}-${issue.id}`}
        </TypeButton>
      )}
      renderOption={({ value: type }) => (
        <Type key={type} onClick={() => updateIssue({ type })}>
          <IssueTypeIcon type={type} top={1} />
          <TypeLabel>{t(`issueTypes.${type}`)}</TypeLabel>
        </Type>
      )}
    />
  );
};

ProjectBoardIssueDetailsType.propTypes = propTypes;

export default ProjectBoardIssueDetailsType;
