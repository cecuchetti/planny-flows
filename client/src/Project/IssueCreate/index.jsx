import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import {
  IssueType,
  IssueStatus,
  IssuePriority,
} from 'shared/constants/issues';
import toast from 'shared/utils/toast';
import useApi from 'shared/hooks/api';
import useCurrentUser from 'shared/hooks/currentUser';
import { Form, IssueTypeIcon, Icon, Avatar, IssuePriorityIcon } from 'shared/components';

import {
  FormHeading,
  FormElement,
  SelectItem,
  SelectItemLabel,
  Divider,
  Actions,
  ActionButton,
} from './Styles';

/* eslint-disable react/require-default-props */

const propTypes = {
  project: PropTypes.object.isRequired,
  fetchProject: PropTypes.func.isRequired,
  onCreate: PropTypes.func.isRequired,
  modalClose: PropTypes.func.isRequired,
};

const userOptions = project => project.users.map(user => ({ value: user.id, label: user.name }));

const ProjectIssueCreate = ({ project, fetchProject, onCreate, modalClose }) => {
  const { t } = useTranslation();
  const [{ isCreating }, createIssue] = useApi.post('/issues');
  const { currentUserId } = useCurrentUser();

  const typeOptions = useMemo(
    () => Object.values(IssueType).map(type => ({ value: type, label: t(`issueTypes.${type}`) })),
    [t],
  );
  const priorityOptions = useMemo(
    () =>
      Object.values(IssuePriority).map(priority => ({
        value: priority,
        label: t(`issuePriorities.${priority}`),
      })),
    [t],
  );

  const renderType = ({ value: type }) => (
    <SelectItem>
      <IssueTypeIcon type={type} top={1} />
      <SelectItemLabel>{t(`issueTypes.${type}`)}</SelectItemLabel>
    </SelectItem>
  );

  const renderPriority = ({ value: priority }) => (
    <SelectItem>
      <IssuePriorityIcon priority={priority} top={1} />
      <SelectItemLabel>{t(`issuePriorities.${priority}`)}</SelectItemLabel>
    </SelectItem>
  );

  return (
    <Form
      enableReinitialize
      initialValues={{
        type: IssueType.TASK,
        title: '',
        description: '',
        reporterId: currentUserId,
        userIds: [],
        priority: IssuePriority.MEDIUM,
      }}
      validations={{
        type: Form.is.required(),
        title: [Form.is.required(), Form.is.maxLength(200)],
        reporterId: Form.is.required(),
        priority: Form.is.required(),
      }}
      onSubmit={async (values, form) => {
        try {
          await createIssue({
            ...values,
            status: IssueStatus.BACKLOG,
            projectId: project.id,
            users: values.userIds.map(id => ({ id })),
          });
          await fetchProject();
          toast.success(t('issue.createdSuccess'));
          onCreate();
        } catch (error) {
          Form.handleAPIError(error, form);
        }
      }}
    >
      <FormElement>
        <FormHeading>{t('issue.createIssue')}</FormHeading>
        <Form.Field.Select
          name="type"
          label={t('issue.issueType')}
          tip={t('issue.tipType')}
          options={typeOptions}
          renderOption={renderType}
          renderValue={renderType}
        />
        <Divider />
        <Form.Field.Input
          name="title"
          label={t('issue.shortSummary')}
          tip={t('issue.tipSummary')}
        />
        <Form.Field.TextEditor
          name="description"
          label={t('issue.description')}
          tip={t('issue.tipDescription')}
        />
        <Form.Field.Select
          name="reporterId"
          label={t('issue.reporter')}
          options={userOptions(project)}
          renderOption={renderUser(project)}
          renderValue={renderUser(project)}
        />
        <Form.Field.Select
          isMulti
          name="userIds"
          label={t('issue.assignees')}
          tip={t('issue.tipAssignees')}
          options={userOptions(project)}
          renderOption={renderUser(project)}
          renderValue={renderUser(project)}
        />
        <Form.Field.Select
          name="priority"
          label={t('issue.priority')}
          tip={t('issue.tipPriority')}
          options={priorityOptions}
          renderOption={renderPriority}
          renderValue={renderPriority}
        />
        <Actions>
          <ActionButton type="submit" variant="primary" isWorking={isCreating}>
            {t('issue.createIssueButton')}
          </ActionButton>
          <ActionButton type="button" variant="empty" onClick={modalClose}>
            {t('common.cancel')}
          </ActionButton>
        </Actions>
      </FormElement>
    </Form>
  );
};

const renderUser = project => ({ value: userId, removeOptionValue }) => {
  const user = project.users.find(({ id }) => id === userId);

  return (
    <SelectItem
      key={user.id}
       $withBottomMargin={!!removeOptionValue}
      onClick={() => removeOptionValue && removeOptionValue()}
    >
      <Avatar size={20} avatarUrl={user.avatarUrl} name={user.name} />
      <SelectItemLabel>{user.name}</SelectItemLabel>
      {removeOptionValue && <Icon type="close" top={2} />}
    </SelectItem>
  );
};

ProjectIssueCreate.propTypes = propTypes;

export default ProjectIssueCreate;
