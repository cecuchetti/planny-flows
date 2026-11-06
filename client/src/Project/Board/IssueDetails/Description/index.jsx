import React, { Fragment, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { getTextContentsFromHtmlString } from 'shared/utils/browser';
import { TextEditor, TextEditedContent } from 'shared/components';

/* eslint-disable react/require-default-props */

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
  isReadonly: PropTypes.bool,
};

const toolbarActions = [
  { id: 'bold', node: <span className="font-bold text-xs">B</span> },
  { id: 'italic', node: <span className="italic text-xs">I</span> },
  { id: 'code', node: <span className="material-symbols-outlined text-[14px]">code</span> },
  {
    id: 'list',
    node: <span className="material-symbols-outlined text-[14px]">format_list_bulleted</span>,
  },
];

function ProjectBoardIssueDetailsDescription({ issue, updateIssue, isReadonly = false }) {
  const { t } = useTranslation();
  const [description, setDescription] = useState(issue.description);
  const [isEditing, setEditing] = useState(false);

  const handleUpdate = () => {
    setEditing(false);
    updateIssue({ description });
  };

  const isDescriptionEmpty = getTextContentsFromHtmlString(description).trim().length === 0;

  const renderBody = () => {
    if (isEditing && !isReadonly) {
      return (
        <Fragment>
          <TextEditor
            placeholder={t('issue.describeIssue')}
            defaultValue={description}
            onChange={setDescription}
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleUpdate}
              className="px-4 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary-container shadow-sm transition-colors"
            >
              {t('common.save')}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container font-label-md text-label-md transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </Fragment>
      );
    }

    if (isDescriptionEmpty) {
      return (
        <button
          type="button"
          onClick={() => !isReadonly && setEditing(true)}
          className={`text-left bg-surface-container-low/40 p-space-md rounded-xl font-body-md text-body-md text-on-surface-variant/60 transition-colors ${
            isReadonly ? 'cursor-default' : 'cursor-pointer hover:bg-surface-container-low/80'
          }`}
        >
          {t('issue.addDescriptionPlaceholder')}
        </button>
      );
    }

    return (
      <div
        role="button"
        tabIndex={isReadonly ? -1 : 0}
        onClick={() => !isReadonly && setEditing(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!isReadonly) setEditing(true);
          }
        }}
        className={`bg-surface-container-lowest p-space-md rounded-xl text-on-surface font-body-md text-body-md leading-relaxed ${
          isReadonly ? 'cursor-default' : 'cursor-pointer'
        }`}
      >
        <TextEditedContent content={description} />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-space-sm">
      {/* Section header: overline + mini toolbar */}
      <div className="flex items-center justify-between">
        <span className="font-overline text-overline uppercase tracking-wider text-on-surface-variant">
          {t('issue.description')}
        </span>
        {!isReadonly && (
          <div className="flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded-lg">
            {toolbarActions.map((action) => (
              <button
                key={action.id}
                type="button"
                title={action.id}
                onClick={() => setEditing(true)}
                className="w-6 h-6 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              >
                {action.node}
              </button>
            ))}
          </div>
        )}
      </div>

      {renderBody()}
    </div>
  );
}

ProjectBoardIssueDetailsDescription.propTypes = propTypes;

export default ProjectBoardIssueDetailsDescription;
