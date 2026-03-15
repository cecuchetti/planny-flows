import React, { Fragment, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { formatDateTimeConversational } from 'shared/utils/dateTime';
import { ConfirmModal } from 'shared/components';

import BodyForm from '../BodyForm';
import {
  Comment,
  UserAvatar,
  Content,
  Username,
  CreatedAt,
  Body,
  EditLink,
  DeleteLink,
} from './Styles';

const propTypes = {
  comment: PropTypes.object.isRequired,
  fetchIssue: PropTypes.func.isRequired,
};

const ProjectBoardIssueDetailsComment = ({ comment, fetchIssue }) => {
  const { t } = useTranslation();
  const [isFormOpen, setFormOpen] = useState(false);
  const [isUpdating, setUpdating] = useState(false);
  const [body, setBody] = useState(comment.body);

  const handleCommentDelete = async () => {
    try {
      await api.delete(`/comments/${comment.id}`);
      await fetchIssue();
    } catch (error) {
      toast.error(error);
    }
  };

  const handleCommentUpdate = async () => {
    try {
      setUpdating(true);
      await api.put(`/comments/${comment.id}`, { body });
      await fetchIssue();
      setUpdating(false);
      setFormOpen(false);
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <Comment data-testid="issue-comment">
      <UserAvatar name={comment.user.name} avatarUrl={comment.user.avatarUrl} />
      <Content>
        <Username>{comment.user.name}</Username>
        <CreatedAt>{formatDateTimeConversational(comment.createdAt)}</CreatedAt>

        {isFormOpen ? (
          <BodyForm
            value={body}
            onChange={setBody}
            isWorking={isUpdating}
            onSubmit={handleCommentUpdate}
            onCancel={() => setFormOpen(false)}
          />
        ) : (
          <Fragment>
            <Body>{comment.body}</Body>
            <EditLink onClick={() => setFormOpen(true)}>{t('common.edit')}</EditLink>
            <ConfirmModal
              title={t('issue.deleteCommentTitle')}
              message={t('issue.deleteConfirmMessage')}
              confirmText={t('issue.deleteComment')}
              onConfirm={handleCommentDelete}
              renderLink={modal => <DeleteLink onClick={modal.open}>{t('common.delete')}</DeleteLink>}
            />
          </Fragment>
        )}
      </Content>
    </Comment>
  );
};

ProjectBoardIssueDetailsComment.propTypes = propTypes;

export default ProjectBoardIssueDetailsComment;
