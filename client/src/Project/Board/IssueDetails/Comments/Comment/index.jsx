import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { formatDateTimeConversational } from 'shared/utils/dateTime';
import { ConfirmModal, Avatar } from 'shared/components';

import BodyForm from '../BodyForm';

const propTypes = {
  comment: PropTypes.object.isRequired,
  fetchIssue: PropTypes.func.isRequired,
};

function ProjectBoardIssueDetailsComment({ comment, fetchIssue }) {
  const { t } = useTranslation();
  const [isFormOpen, setFormOpen] = useState(false);
  const [isUpdating, setUpdating] = useState(false);
  const [isLiked, setLiked] = useState(false);
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

  const handleReplyClick = () => {
    // Visual only: focus the composer textarea in the Create component.
    const composerTextarea = document.querySelector('[data-testid="comment-create-textarea"]');
    if (composerTextarea) {
      composerTextarea.focus();
      return;
    }
    // If the composer is not open (fake textarea state), trigger a click to open it.
    const fakeTextarea = document.querySelector('[data-testid="comment-create-fake-textarea"]');
    if (fakeTextarea) {
      fakeTextarea.click();
    }
  };

  return (
    <div
      data-testid="issue-comment"
      className="flex items-start gap-space-md p-space-md rounded-2xl bg-surface-container-low/30 hover:bg-surface-container-low/60 transition-colors group"
    >
      <Avatar
        name={comment.user.name}
        avatarUrl={comment.user.avatarUrl}
        size={32}
        className="flex-shrink-0"
      />
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-label-lg text-label-lg font-bold text-on-surface">
              {comment.user.name}
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant/70">
              {formatDateTimeConversational(comment.createdAt)}
            </span>
          </div>
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-on-surface-variant/70 transition-opacity">
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              title={t('common.edit')}
              className="p-1 hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
            </button>
            <ConfirmModal
              title={t('issue.deleteCommentTitle')}
              message={t('issue.deleteConfirmMessage')}
              confirmText={t('issue.deleteComment')}
              onConfirm={handleCommentDelete}
              renderLink={(modal) => (
                <button
                  type="button"
                  onClick={modal.open}
                  title={t('common.delete')}
                  className="p-1 hover:text-error transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              )}
            />
          </div>
        </div>

        {isFormOpen ? (
          <BodyForm
            value={body}
            onChange={setBody}
            isWorking={isUpdating}
            onSubmit={handleCommentUpdate}
            onCancel={() => setFormOpen(false)}
          />
        ) : (
          <p className="font-body-md text-body-md text-on-surface leading-relaxed whitespace-pre-wrap">
            {comment.body}
          </p>
        )}

        {/* Reaction + Actions (visual only) */}
        <div className="flex items-center gap-space-md pt-1">
          <button
            type="button"
            onClick={() => setLiked(!isLiked)}
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-md text-label-md transition-colors ${
              isLiked
                ? 'bg-primary/10 text-primary'
                : 'bg-surface-container-high hover:bg-surface-container-highest text-on-surface'
            }`}
            title="Like comment"
          >
            <span>👍</span>
            {isLiked && (
              <span className="font-code-key text-code-key font-semibold">1</span>
            )}
          </button>
          <button
            type="button"
            onClick={handleReplyClick}
            className="font-label-md text-label-md text-on-surface-variant font-semibold hover:text-primary transition-colors"
          >
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}

ProjectBoardIssueDetailsComment.propTypes = propTypes;

export default ProjectBoardIssueDetailsComment;
