import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { ProjectCategory, ProjectCategoryCopy } from 'shared/constants/projects';
import toast from 'shared/utils/toast';
import useApi from 'shared/hooks/api';
import useCurrentUser from 'shared/hooks/currentUser';
import { Accordion, Form } from 'shared/components';

import RuntimeSections from './RuntimeSections';
import { ActionButton, FormElement, Page, PageHeader, PageSubtitle, PageTitle } from './Styles';

const propTypes = {
  project: PropTypes.object.isRequired,
  fetchProject: PropTypes.func.isRequired,
};

const categoryOptions = Object.values(ProjectCategory).map((category) => ({
  value: category,
  label: ProjectCategoryCopy[category],
}));

/**
 * Settings page: the project's own details and the application's runtime
 * configuration, in one place.
 *
 * They used to be two tabs, which meant an operator changing a Jira URL had to
 * know that "Runtime configuration" existed and that "Project settings" did not
 * contain it. They are sections of one page now, and the runtime sections only
 * appear for an administrator — the API is not even mounted without one.
 */
function ProjectSettings({ project, fetchProject }) {
  const { t } = useTranslation();
  const { isAdmin } = useCurrentUser();
  const [{ isUpdating }, updateProject] = useApi.put('/project');

  return (
    <Page>
      <PageHeader>
        <PageTitle>{t('configuration.settingsTitle')}</PageTitle>
        <PageSubtitle>{t('configuration.settingsSubtitle')}</PageSubtitle>
      </PageHeader>

      <Form
        initialValues={Form.initialValues(project, (get) => ({
          name: get('name'),
          url: get('url'),
          category: get('category'),
          description: get('description'),
        }))}
        validations={{
          name: [Form.is.required(), Form.is.maxLength(100)],
          url: Form.is.url(),
          category: Form.is.required(),
        }}
        onSubmit={async (values, form) => {
          try {
            await updateProject(values);
            await fetchProject();
            toast.success(t('issue.savedSuccess'));
          } catch (error) {
            Form.handleAPIError(error, form);
          }
        }}
      >
        <Accordion
          title={t('configuration.projectSection')}
          subtitle={t('configuration.projectSectionHint')}
          defaultOpen
        >
          <FormElement>
            <Form.Field.Input name="name" label={t('common.name')} />
            <Form.Field.Input name="url" label={t('common.url')} />
            <Form.Field.TextEditor
              name="description"
              label={t('issue.description')}
              tip={t('issue.tipProjectDescription')}
            />
            <Form.Field.Select
              name="category"
              label={t('board.projectCategory')}
              options={categoryOptions}
            />

            <ActionButton type="submit" variant="primary" isWorking={isUpdating}>
              {t('common.saveChanges')}
            </ActionButton>
          </FormElement>
        </Accordion>
      </Form>

      {isAdmin && <RuntimeSections />}
    </Page>
  );
}

ProjectSettings.propTypes = propTypes;

export default ProjectSettings;
