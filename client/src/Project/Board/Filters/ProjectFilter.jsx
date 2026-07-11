import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Select } from 'shared/components';

const ProjectSelectWrapper = styled.div`
  margin: 12px 0 16px 0;
  max-width: 400px;
`;

const ProjectLabel = styled.div`
  font-size: 13px;
  color: #5e6c84;
  font-weight: 500;
  margin-bottom: 6px;
`;

function ProjectFilter({ projects, selectedIds, onChange }) {
  const { t } = useTranslation();

  if (!projects || projects.length === 0) {
    return null;
  }

  const options = projects.map((project) => {
    const sourceType = project.sourceType || project.source_type;
    const icon = sourceType === 'jira' ? '🔗' : '📌';
    return {
      value: project.id,
      label: `${icon} ${project.name}`,
    };
  });

  return (
    <ProjectSelectWrapper data-testid="project-filter">
      <ProjectLabel>{t('board.filterByProject')}</ProjectLabel>
      <Select
        isMulti
        placeholder={t('board.selectProjects')}
        options={options}
        value={selectedIds}
        onChange={onChange}
      />
    </ProjectSelectWrapper>
  );
}

ProjectFilter.propTypes = {
  projects: PropTypes.array.isRequired,
  selectedIds: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default ProjectFilter;
