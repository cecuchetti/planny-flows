import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Select } from 'shared/components';

import { CountRow, ShowAllLink } from './Styles';

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

  /*
   * The board has two ways to choose projects — the saved preference and the
   * sidebar's `?filter=` links — and without saying which is in effect, a board
   * showing a saved subset looks exactly like one showing everything. That is
   * how "the two views show the same thing" becomes a mystery instead of an
   * observation.
   */
  const isPartial = selectedIds.length !== projects.length;
  const showAll = () => onChange(projects.map((project) => project.id));

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

      <CountRow>
        {t('board.showingProjects', {
          selected: selectedIds.length,
          total: projects.length,
        })}
        {isPartial && (
          <ShowAllLink type="button" onClick={showAll}>
            {t('board.showAllProjects')}
          </ShowAllLink>
        )}
      </CountRow>
    </ProjectSelectWrapper>
  );
}

ProjectFilter.propTypes = {
  projects: PropTypes.array.isRequired,
  selectedIds: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default ProjectFilter;
