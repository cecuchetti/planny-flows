import React, { Fragment, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { Textarea } from 'shared/components';

/* eslint-disable react/require-default-props */

const propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  isWorking: PropTypes.bool.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  showQuickActions: PropTypes.bool,
};

const quickActions = [
  { id: 'mention', title: 'Mention teammate', icon: 'alternate_email' },
  { id: 'emoji', title: 'Add emoji', icon: 'sentiment_satisfied' },
  { id: 'attach', title: 'Attach file', icon: 'attach_file' },
];

function ProjectBoardIssueDetailsCommentsBodyForm({
  value,
  onChange,
  isWorking,
  onSubmit,
  onCancel,
  showQuickActions = false,
}) {
  const { t } = useTranslation();
  const $textareaRef = useRef();

  const handleSubmit = () => {
    if ($textareaRef.current.value.trim()) {
      onSubmit();
    }
  };

  return (
    <Fragment>
      <Textarea
        autoFocus
        placeholder={t('issue.addCommentPlaceholder')}
        value={value}
        onChange={onChange}
        ref={$textareaRef}
        data-testid={showQuickActions ? 'comment-create-textarea' : undefined}
        className="[&_textarea]:bg-surface-container-lowest [&_textarea]:rounded-xl [&_textarea]:p-3 [&_textarea]:shadow-xs [&_textarea]:resize-none [&_textarea]:border-none [&_textarea]:focus:shadow-none [&_textarea]:focus:ring-0 [&_textarea]:font-body-md [&_textarea]:text-body-md [&_textarea]:text-on-surface [&_textarea]:placeholder:text-on-surface-variant/50 [&_textarea]:leading-relaxed"
      />
      <div className="flex items-center justify-between">
        {showQuickActions ? (
          <div className="flex items-center gap-1 text-on-surface-variant/70">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                title={action.title}
                className="p-1 rounded hover:bg-surface-container hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">{action.icon}</span>
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {/* Create composer: Cancel only when there's text; edit mode: always available */}
          {(showQuickActions ? Boolean(value.trim()) : true) && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container font-label-md text-label-md transition-colors"
            >
              {t('common.cancel')}
            </button>
          )}
          <button
            type="button"
            disabled={isWorking}
            onClick={handleSubmit}
            className="px-4 py-1.5 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md font-semibold hover:bg-primary shadow-xs transition-colors disabled:opacity-60"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </Fragment>
  );
}

ProjectBoardIssueDetailsCommentsBodyForm.propTypes = propTypes;

export default ProjectBoardIssueDetailsCommentsBodyForm;
