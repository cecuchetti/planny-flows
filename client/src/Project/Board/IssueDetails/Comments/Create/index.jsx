import React, { Fragment, useState } from 'react';
import PropTypes from 'prop-types';

import api from 'shared/utils/api';
import useCurrentUser from 'shared/hooks/currentUser';
import toast from 'shared/utils/toast';
import { Avatar } from 'shared/components';

import BodyForm from '../BodyForm';

const propTypes = {
  issueId: PropTypes.number.isRequired,
  fetchIssue: PropTypes.func.isRequired,
};

const quickActions = [
  { id: 'mention', title: 'Mention teammate', icon: 'alternate_email' },
  { id: 'emoji', title: 'Add emoji', icon: 'sentiment_satisfied' },
  { id: 'attach', title: 'Attach file', icon: 'attach_file' },
];

function ProjectBoardIssueDetailsCommentsCreate({ issueId, fetchIssue }) {
  const [isFormOpen, setFormOpen] = useState(false);
  const [isCreating, setCreating] = useState(false);
  const [body, setBody] = useState('');

  const { currentUser } = useCurrentUser();

  const handleCommentCreate = async () => {
    try {
      setCreating(true);
      await api.post(`/comments`, { body, issueId, userId: currentUser.id });
      await fetchIssue();
      setFormOpen(false);
      setCreating(false);
      setBody('');
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <div className="flex items-start gap-space-md bg-surface-container-low/60 p-space-md rounded-2xl">
      {currentUser && (
        <Avatar
          name={currentUser.name}
          avatarUrl={currentUser.avatarUrl}
          size={32}
          className="flex-shrink-0"
        />
      )}
      <div className="flex-1 flex flex-col gap-space-sm" data-testid="comment-composer">
        {isFormOpen ? (
          <BodyForm
            value={body}
            onChange={setBody}
            isWorking={isCreating}
            showQuickActions
            onSubmit={handleCommentCreate}
            onCancel={() => setFormOpen(false)}
          />
        ) : (
          <Fragment>
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="w-full text-left bg-surface-container-lowest rounded-xl p-3 font-body-md text-body-md text-on-surface-variant/50 cursor-text transition-colors hover:bg-surface-container-lowest/80 shadow-xs"
              data-testid="comment-create-fake-textarea"
            >
              Add a comment... (Markdown supported)
            </button>
            <div className="flex items-center gap-1 text-on-surface-variant/70">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  title={action.title}
                  onClick={() => setFormOpen(true)}
                  className="p-1 rounded hover:bg-surface-container hover:text-on-surface transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">{action.icon}</span>
                </button>
              ))}
            </div>
          </Fragment>
        )}
      </div>
    </div>
  );
}

ProjectBoardIssueDetailsCommentsCreate.propTypes = propTypes;

export default ProjectBoardIssueDetailsCommentsCreate;
