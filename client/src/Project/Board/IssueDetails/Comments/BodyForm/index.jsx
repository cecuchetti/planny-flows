import React, { Fragment, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { Textarea } from 'shared/components';

import { Actions, FormButton } from './Styles';

const propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  isWorking: PropTypes.bool.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

const ProjectBoardIssueDetailsCommentsBodyForm = ({
  value,
  onChange,
  isWorking,
  onSubmit,
  onCancel,
}) => {
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
      />
      <Actions>
        <FormButton variant="primary" isWorking={isWorking} onClick={handleSubmit}>
          {t('common.save')}
        </FormButton>
        <FormButton variant="empty" onClick={onCancel}>
          {t('common.cancel')}
        </FormButton>
      </Actions>
    </Fragment>
  );
};

ProjectBoardIssueDetailsCommentsBodyForm.propTypes = propTypes;

export default ProjectBoardIssueDetailsCommentsBodyForm;
