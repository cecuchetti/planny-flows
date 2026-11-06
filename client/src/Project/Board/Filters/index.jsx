import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import xor from 'lodash/xor';
import { useTranslation } from 'react-i18next';

import { Avatar } from 'shared/components';

const propTypes = {
  projectUsers: PropTypes.array.isRequired,
  defaultFilters: PropTypes.object.isRequired,
  filters: PropTypes.object.isRequired,
  mergeFilters: PropTypes.func.isRequired,
  issues: PropTypes.array,
};

function ProjectBoardFilters({ projectUsers, defaultFilters, filters, mergeFilters, issues }) {
  const { t } = useTranslation();
  const { searchTerm, userIds, myOnly, recent } = filters;

  const [searchValue, setSearchValue] = useState(searchTerm);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const searchTimeout = useRef(null);
  const popoverContainerRef = useRef(null);

  useEffect(() => {
    setSearchValue(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    if (!popoverOpen) return;
    const handleOutsideClick = (e) => {
      if (popoverContainerRef.current && !popoverContainerRef.current.contains(e.target)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [popoverOpen]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchValue(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => mergeFilters({ searchTerm: value }), 300);
  };

  const assigneeIds = new Set();
  (issues || []).forEach((issue) => (issue.userIds || []).forEach((id) => assigneeIds.add(id)));

  const assignedUsers = assigneeIds.size > 0 ? projectUsers.filter((u) => assigneeIds.has(u.id)) : [];
  const visibleUsers = assignedUsers.slice(0, 4);
  const overflowCount = projectUsers.length - 4;

  const popoverUsers = (() => {
    const assigned = assignedUsers;
    const unassigned = projectUsers.filter((u) => !assigneeIds.has(u.id));
    const ordered = [...assigned, ...unassigned];
    return ordered;
  })();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pb-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search input */}
        <div className="relative w-[280px]">
          <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-[18px] text-outline">search</span>
          </span>
          <input
            className="w-full h-[34px] pl-9 pr-3 rounded-xl bg-surface-container-lowest text-on-surface font-body-sm text-body-sm shadow-sm placeholder:text-outline border-0 focus:outline-none focus:bg-surface-container-lowest transition-all"
            placeholder={t('board.searchIssues')}
            type="text"
            value={searchValue}
            onChange={handleSearchChange}
          />
        </div>
        {/* Avatar Filter Row */}
        <div className="flex items-center -space-x-2.5 pl-1">
          {visibleUsers.map((user) => (
            <button
              key={user.id}
              type="button"
              title={`Filter by ${user.name}${userIds.includes(user.id) ? ' (Active)' : ''}`}
              onClick={() => mergeFilters({ userIds: xor(userIds, [user.id]) })}
              className={`relative group hover:z-30 transition-transform ${
                userIds.includes(user.id) ? 'z-20' : 'z-10'
              }`}
            >
              <div
                className={`w-[28px] h-[28px] rounded-full shadow-sm ring-2 transition-all ${
                  userIds.includes(user.id)
                    ? 'ring-secondary'
                    : 'ring-surface-container-lowest hover:ring-primary'
                }`}
              >
                <Avatar avatarUrl={user.avatarUrl} name={user.name} size={28} />
              </div>
              {userIds.includes(user.id) && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-secondary rounded-full flex items-center justify-center text-on-secondary text-[8px]">
                  <span className="material-symbols-outlined text-[9px] font-bold">check</span>
                </span>
              )}
            </button>
          ))}
          {projectUsers.length > 4 && (
            <div
              ref={popoverContainerRef}
              className="relative"
              onMouseLeave={() => setPopoverOpen(false)}
            >
              <button
                type="button"
                className="w-[28px] h-[28px] rounded-full bg-surface-container-high text-on-surface-variant font-code-key text-[11px] font-semibold flex items-center justify-center ring-2 ring-surface-container-lowest shadow-sm hover:bg-surface-container transition-colors"
                onMouseEnter={() => setPopoverOpen(true)}
                onClick={() => setPopoverOpen((prev) => !prev)}
              >
                +{overflowCount}
              </button>
              {popoverOpen && (
                <div
                  className="absolute top-full left-0 mt-2 z-50 w-64 rounded-xl bg-surface-container-lowest shadow-lg border border-outline-variant/40 p-2"
                  role="listbox"
                >
                  {popoverUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      role="option"
                      aria-selected={userIds.includes(user.id)}
                      onClick={() => mergeFilters({ userIds: xor(userIds, [user.id]) })}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-container-low cursor-pointer w-full text-left"
                    >
                      <Avatar avatarUrl={user.avatarUrl} name={user.name} size={24} />
                      <span className="flex-1 font-label-md text-label-md text-on-surface truncate">
                        {user.name}
                      </span>
                      {userIds.includes(user.id) && (
                        <span className="material-symbols-outlined text-[16px] text-primary">
                          check
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Quick Toggles */}
        <div className="flex items-center gap-2 pl-2">
          <button
            type="button"
            onClick={() => mergeFilters({ myOnly: !myOnly })}
            className={`h-[34px] px-3 rounded-xl font-label-md text-label-md flex items-center gap-1.5 shadow-sm transition-all ${
              myOnly
                ? 'bg-surface-container-high text-primary'
                : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[16px] ${myOnly ? 'text-primary' : 'text-on-surface-variant'}`}
            >
              person
            </span>
            <span>{t('board.onlyMyIssues')}</span>
          </button>
          <button
            type="button"
            onClick={() => mergeFilters({ recent: !recent })}
            className={`h-[34px] px-3 rounded-xl font-label-md text-label-md flex items-center gap-1.5 shadow-sm transition-all ${
              recent
                ? 'bg-surface-container-high text-primary'
                : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[16px] ${recent ? 'text-primary' : 'text-on-surface-variant'}`}
            >
              schedule
            </span>
            <span>{t('board.recentlyUpdated')}</span>
          </button>
        </div>
      </div>
      {/* Clear all */}
      <button
        type="button"
        onClick={() => mergeFilters(defaultFilters)}
        className="text-primary hover:underline font-label-md text-label-md font-medium flex items-center gap-1"
      >
        <span>{t('common.clearAll')}</span>
      </button>
    </div>
  );
}

ProjectBoardFilters.propTypes = propTypes;

export default ProjectBoardFilters;
