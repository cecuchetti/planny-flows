import React, { Fragment, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { getTextContentsFromHtmlString } from 'shared/utils/browser';
import { TextEditor, TextEditedContent, Button } from 'shared/components';

import { Title, EmptyLabel, Actions } from './Styles';

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
  isReadonly: PropTypes.bool,
};

const ProjectBoardIssueDetailsDescription = ({ issue, updateIssue, isReadonly = false }) => {
  const { t } = useTranslation();
  const [description, setDescription] = useState(issue.description);
  const [isEditing, setEditing] = useState(false);

  const handleUpdate = () => {
    setEditing(false);
    updateIssue({ description });
  };

  const isDescriptionEmpty = getTextContentsFromHtmlString(description).trim().length === 0;

  return (
    <Fragment>
      <Title>{t('issue.description')}</Title>
      {isEditing && !isReadonly ? (
        <Fragment>
          <TextEditor
            placeholder={t('issue.describeIssue')}
            defaultValue={description}
            onChange={setDescription}
          />
          <Actions>
            <Button variant="primary" onClick={handleUpdate}>
              {t('common.save')}
            </Button>
            <Button variant="empty" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
          </Actions>
        </Fragment>
      ) : (
        <Fragment>
          {isDescriptionEmpty ? (
            <EmptyLabel
              onClick={() => !isReadonly && setEditing(true)}
              style={isReadonly ? { cursor: 'default' } : undefined}
            >
              {t('issue.addDescriptionPlaceholder')}
            </EmptyLabel>
          ) : (
            <TextEditedContent
              content={description}
              onClick={() => !isReadonly && setEditing(true)}
              style={isReadonly ? { cursor: 'default' } : undefined}
            />
          )}
        </Fragment>
      )}
    </Fragment>
  );
};

ProjectBoardIssueDetailsDescription.propTypes = propTypes;

export default ProjectBoardIssueDetailsDescription;
