import React, { Fragment, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { KeyCodes } from 'shared/constants/keyCodes';
import { is, generateErrors } from 'shared/utils/validation';

/* eslint-disable react/require-default-props */

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
  isReadonly: PropTypes.bool,
};

function ProjectBoardIssueDetailsTitle({ issue, updateIssue, isReadonly = false }) {
  const { t } = useTranslation();
  const $titleInputRef = useRef();
  const [error, setError] = useState(null);

  const handleTitleChange = () => {
    setError(null);

    const title = $titleInputRef.current.value;
    if (title === issue.title) return;

    const errors = generateErrors({ title }, { title: [is.required(), is.maxLength(200)] });

    if (errors.title) {
      setError(errors.title);
    } else {
      updateIssue({ title });
    }
  };

  const handleEditClick = () => {
    if (isReadonly) return;
    if ($titleInputRef.current) {
      $titleInputRef.current.focus();
      $titleInputRef.current.select();
    }
  };

  return (
    <Fragment>
      <div className="group relative flex items-start gap-space-sm">
        <textarea
          rows={1}
          className={`w-full bg-transparent rounded-lg font-headline-lg text-headline-lg font-bold text-on-surface leading-tight tracking-tight flex-1 resize-none focus:outline-none border border-transparent transition-colors ${
            isReadonly
              ? 'cursor-default'
              : 'cursor-text hover:border-surface-container-high focus:bg-surface-container-lowest focus:border-primary/40 px-2 py-1 -mx-2'
          }`}
          placeholder={t('issue.shortSummaryPlaceholder')}
          defaultValue={issue.title}
          ref={$titleInputRef}
          onBlur={handleTitleChange}
          onKeyDown={(event) => {
            if (event.keyCode === KeyCodes.ENTER) {
              event.preventDefault();
              event.target.blur();
            }
          }}
          readOnly={isReadonly}
          data-testid="issue-title"
        />
        {!isReadonly && (
          <button
            type="button"
            onClick={handleEditClick}
            title="Edit summary"
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
        )}
      </div>
      {error && (
        <span className="pt-space-xs text-error font-body-sm text-body-sm font-medium">{error}</span>
      )}
    </Fragment>
  );
}

ProjectBoardIssueDetailsTitle.propTypes = propTypes;

export default ProjectBoardIssueDetailsTitle;
