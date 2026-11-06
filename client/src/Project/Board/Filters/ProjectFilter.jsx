import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

function ProjectFilter({ projects, selectedIds, onChange }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef(null);

  // Close dropdown on outside click — must be called before early return
  useEffect(() => {
    if (!expanded) return;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expanded]);

  if (!projects || projects.length === 0) {
    return null;
  }

  const showAll = () => {
    onChange(projects.map((project) => project.id));
    setExpanded(false);
  };

  const removeProject = (e, id) => {
    e.stopPropagation();
    onChange(selectedIds.filter((sid) => sid !== id));
  };

  const toggleExpand = () => {
    setExpanded((prev) => !prev);
  };

  const toggleProject = (id) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const getIcon = (project) => {
    const sourceType = project.sourceType || project.source_type;
    return sourceType === 'jira' ? '🔗' : '📌';
  };

  const selectedProjects = projects.filter((p) => selectedIds.includes(p.id));

  return (
    <div data-testid="project-filter" className="flex flex-col gap-1.5 pb-5">
      <span className="font-label-md text-label-md text-on-surface-variant font-medium">
        {t('board.filterByProject')}
      </span>
      <div className="flex items-center gap-3">
        {/* Compact selector box + dropdown */}
        <div className="relative" ref={containerRef}>
          <div
            className="h-[38px] max-w-[440px] w-full rounded-xl bg-surface-container-lowest shadow-sm px-3 flex items-center justify-between cursor-pointer hover:bg-surface-container-low transition-colors"
            onClick={toggleExpand}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(); } }}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {selectedProjects.map((project, idx) => (
                <span
                  key={project.id}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-label-md text-label-md shrink-0 ${
                    idx === 0
                      ? 'bg-secondary-fixed text-on-secondary-fixed'
                      : 'bg-surface-container-high text-on-surface'
                  }`}
                >
                  <span className="text-xs">{getIcon(project)}</span>
                  <span className={idx === 0 ? 'truncate max-w-[130px]' : ''}>{project.name}</span>
                  <button
                    type="button"
                    className={`flex items-center ${
                      idx === 0
                        ? 'text-on-secondary-fixed hover:opacity-75'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                    onClick={(e) => removeProject(e, project.id)}
                  >
                    <span className="material-symbols-outlined text-[13px]">close</span>
                  </button>
                </span>
              ))}
            </div>
            <span className="material-symbols-outlined text-[18px] text-outline shrink-0 ml-1">
              expand_more
            </span>
          </div>

          {/* Dropdown panel */}
          {expanded && (
            <div className="absolute mt-2 w-full max-w-[440px] rounded-xl bg-surface-container-lowest shadow-lg border border-outline-variant/40 p-2 z-50">
              {projects.map((project) => {
                const isSelected = selectedIds.includes(project.id);
                return (
                  <div
                    key={project.id}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-container-low cursor-pointer"
                    onClick={() => toggleProject(project.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProject(project.id); } }}
                  >
                    <span className="material-symbols-outlined text-[18px] text-primary">
                      {isSelected ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                    <span className="text-xs">{getIcon(project)}</span>
                    <span className="font-label-md">{project.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Showing count + show all toggle — always visible */}
        <div className="flex items-center gap-2 font-label-md text-label-md whitespace-nowrap">
          <span className="text-on-surface-variant">
            {t('board.showingProjects', {
              selected: selectedIds.length,
              total: projects.length,
            })}
          </span>
          <span className="text-outline-variant">&bull;</span>
          <button
            type="button"
            onClick={showAll}
            className="text-primary hover:underline font-medium"
          >
            {t('board.showAllProjects')}
          </button>
        </div>
      </div>
    </div>
  );
}

ProjectFilter.propTypes = {
  projects: PropTypes.array.isRequired,
  selectedIds: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default ProjectFilter;
