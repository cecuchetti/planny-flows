import React, { Fragment, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { getTextContentsFromHtmlString } from 'shared/utils/browser';
import { TextEditor, TextEditedContent, Button } from 'shared/components';

import { Title, EmptyLabel, Actions } from './Styles';

const propTypes = {
  issue: PropTypes.object.isRequired,
  updateIssue: PropTypes.func.isRequired,
};

const ProjectBoardIssueDetailsDescription = ({ issue, updateIssue }) => {
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
      {isEditing ? (
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
            <EmptyLabel onClick={() => setEditing(true)}>{t('issue.addDescriptionPlaceholder')}</EmptyLabel>
          ) : (
            <TextEditedContent content={description} onClick={() => setEditing(true)} />
          )}
        </Fragment>
      )}
    </Fragment>
  );
};

ProjectBoardIssueDetailsDescription.propTypes = propTypes;

export default ProjectBoardIssueDetailsDescription;
