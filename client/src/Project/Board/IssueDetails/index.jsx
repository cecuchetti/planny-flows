import React, { Fragment, useState } from 'react';
import PropTypes from 'prop-types';

import api from 'shared/utils/api';
import useApi from 'shared/hooks/api';
import {
  PageError,
  CopyLinkButton,
  Button,
  AboutTooltip,
  Icon,
  Avatar,
  IssueTypeIcon,
  IssuePriorityIcon,
  TextEditedContent,
} from 'shared/components';
import { formatDateTimeConversational } from 'shared/utils/dateTime';

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
import {
  TopActions,
  TopActionsRight,
  Content,
  Left,
  Right,
  SectionTitle,
  ReadonlyBanner,
  ReadonlyKey,
  ExternalActions,
  ReadonlyField,
  ReadonlyBadge,
  ReadonlyComment,
  ReadonlyCommentBody,
  ReadonlyTitle,
  JiraLink,
} from './Styles';

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

  if (!data) return <Loader />;
  if (error) return <PageError />;

  const { issue } = data;
  const isReadonly = issue.readonly === true;
  const externalKey = issue.externalKey || issue.external_key;
  const canShowExternalActions = isReadonly && externalKey;
  const canShowJiraLink = canShowExternalActions && JIRA_BASE_URL;
  const getUserById = (userId) => projectUsers.find((user) => user.id === userId);

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

  return (
    <Fragment>
      <TopActions>
        <Type issue={issue} updateIssue={updateIssue} isReadonly={isReadonly} />
        <TopActionsRight>
          <AboutTooltip
            renderLink={(linkProps) => (
              <Button icon="feedback" variant="empty" {...linkProps}>
                Give feedback
              </Button>
            )}
          />
          <CopyLinkButton variant="empty" />
          {!isReadonly && (
            <Delete issue={issue} fetchProject={fetchProject} modalClose={modalClose} />
          )}
          {canShowExternalActions && (
            <ExternalActions>
              <Button variant="primary" icon="stopwatch" onClick={() => setTimeEntryOpen(true)}>
                Log Time
              </Button>
              {canShowJiraLink && (
                <JiraLink
                  href={`https://${JIRA_BASE_URL}/browse/${externalKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View in Jira ↗
                </JiraLink>
              )}
            </ExternalActions>
          )}
          <Button icon="close" iconSize={24} variant="empty" onClick={modalClose} />
        </TopActionsRight>
      </TopActions>
      {isReadonly && (
        <ReadonlyBanner>
          <Icon type="link" size={16} top={1} />
          <span>Read-only — Jira issue</span>
          {externalKey && <ReadonlyKey>{externalKey}</ReadonlyKey>}
        </ReadonlyBanner>
      )}
      <Content>
        <Left>
          <Title issue={issue} updateIssue={updateIssue} isReadonly={isReadonly} />
          <Description issue={issue} updateIssue={updateIssue} isReadonly={isReadonly} />
          <Comments issue={issue} fetchIssue={fetchIssue} />
        </Left>
        <Right>
          <Status issue={issue} updateIssue={updateIssue} isReadonly={isReadonly} />
          <AssigneesReporter
            issue={issue}
            updateIssue={updateIssue}
            projectUsers={projectUsers}
            isReadonly={isReadonly}
          />
          <Priority issue={issue} updateIssue={updateIssue} isReadonly={isReadonly} />
          <EstimateTracking issue={issue} updateIssue={updateIssue} isReadonly={isReadonly} />
          {isReadonly && isTimeEntryOpen && (
            <div style={{ marginTop: '24px', borderTop: '1px solid #dfe1e6', paddingTop: '16px' }}>
              <SectionTitle style={{ marginTop: 0 }}>Log Work</SectionTitle>
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
          <Dates issue={issue} />
        </Right>
      </Content>
    </Fragment>
  );
}

ProjectBoardIssueDetails.propTypes = propTypes;

export default ProjectBoardIssueDetails;
