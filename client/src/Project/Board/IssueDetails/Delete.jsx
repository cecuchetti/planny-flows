import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { ConfirmModal } from 'shared/components';

const propTypes = {
  issue: PropTypes.object.isRequired,
  fetchProject: PropTypes.func.isRequired,
  modalClose: PropTypes.func.isRequired,
};

function ProjectBoardIssueDetailsDelete({ issue, fetchProject, modalClose }) {
  const { t } = useTranslation();

  const handleIssueDelete = async () => {
    try {
      await api.delete(`/issues/${issue.id}`);
      await fetchProject();
      modalClose();
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <ConfirmModal
      title={t('issue.deleteConfirmTitle')}
      message={t('issue.deleteConfirmMessage')}
      confirmText={t('common.delete')}
      onConfirm={handleIssueDelete}
      renderLink={(modal) => (
        <button
          type="button"
          onClick={modal.open}
          title={t('issue.delete')}
          data-testid="issue-delete-button"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      )}
    />
  );
}

ProjectBoardIssueDetailsDelete.propTypes = propTypes;

export default ProjectBoardIssueDetailsDelete;
