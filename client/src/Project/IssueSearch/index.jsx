import React, { Fragment, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import get from 'lodash/get';
import { useTranslation } from 'react-i18next';

import useApi from 'shared/hooks/api';
import { sortByNewest } from 'shared/utils/javascript';
import { IssueTypeIcon } from 'shared/components';

import NoResultsSVG from './NoResultsSvg';
import {
  IssueSearch,
  SearchInputCont,
  SearchInputDebounced,
  SearchIcon,
  SearchSpinner,
  Issue,
  IssueData,
  IssueTitle,
  IssueTypeId,
  SectionTitle,
  NoResults,
  NoResultsTitle,
  NoResultsTip,
} from './Styles';

const propTypes = {
  project: PropTypes.object.isRequired,
};

const ProjectIssueSearch = ({ project }) => {
  const { t } = useTranslation();
  const [isSearchTermEmpty, setIsSearchTermEmpty] = useState(true);

  const [{ data, isLoading }, fetchIssues] = useApi.get('/issues', {}, { lazy: true });

  const matchingIssues = get(data, 'issues', []);

  const recentIssues = sortByNewest(project.issues, 'createdAt').slice(0, 10);

  const handleSearchChange = (value) => {
    const searchTerm = value.trim();

    setIsSearchTermEmpty(!searchTerm);

    if (searchTerm) {
      fetchIssues({ searchTerm });
    }
  };

  return (
    <IssueSearch>
      <SearchInputCont>
        <SearchInputDebounced
          autoFocus
          placeholder={t('board.searchPlaceholder')}
          onChange={handleSearchChange}
        />
        <SearchIcon type="search" size={22} />
        {isLoading && <SearchSpinner />}
      </SearchInputCont>

      {isSearchTermEmpty && recentIssues.length > 0 && (
        <Fragment>
          <SectionTitle>{t('board.recentIssues')}</SectionTitle>
          {recentIssues.map(renderIssue)}
        </Fragment>
      )}

      {!isSearchTermEmpty && matchingIssues.length > 0 && (
        <Fragment>
          <SectionTitle>{t('board.matchingIssues')}</SectionTitle>
          {matchingIssues.map(renderIssue)}
        </Fragment>
      )}

      {!isSearchTermEmpty && !isLoading && matchingIssues.length === 0 && (
        <NoResults>
          <NoResultsSVG />
          <NoResultsTitle>{t('board.noResultsTitle')}</NoResultsTitle>
          <NoResultsTip>{t('board.noResultsTip')}</NoResultsTip>
        </NoResults>
      )}
    </IssueSearch>
  );
};

const renderIssue = (issue) => (
  <Link key={issue.id} to={`/project/board/issues/${issue.id}`}>
    <Issue>
      <IssueTypeIcon type={issue.type} size={25} />
      <IssueData>
        <IssueTitle>{issue.title}</IssueTitle>
        <IssueTypeId>{`${issue.type}-${issue.id}`}</IssueTypeId>
      </IssueData>
    </Issue>
  </Link>
);

ProjectIssueSearch.propTypes = propTypes;

export default ProjectIssueSearch;
