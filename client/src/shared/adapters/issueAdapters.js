import { IssueStatus, IssueType, IssueStatusCopy, IssueTypeCopy } from 'shared/constants/issues';
import { 
  issueStatusColors, 
  issueStatusBackgroundColors, 
  issueTypeColors,
  jiraStatusColors,
} from 'shared/utils/styles';

// Priority strip colors matching board component
const priorityStripColor = {
  5: '#ef4444', // Highest — red
  4: '#f97316', // High — orange
  3: '#eab308', // Medium — yellow
  2: '#14b8a6', // Low — teal
  1: '#94a3b8', // Lowest — slate
};

// Map Jira statuses to board statuses for consistent coloring
const mapJiraStatusToBoardStatus = (jiraStatus) => {
  if (!jiraStatus) return IssueStatus.BACKLOG;
  
  const status = jiraStatus.toLowerCase().trim();
  
  // Common Jira status patterns
  if (status.includes('backlog') || status.includes('todo') || status.includes('open')) return IssueStatus.BACKLOG;
  if (status.includes('selected') || status.includes('ready') || status.includes('approved')) return IssueStatus.SELECTED;
  if (status.includes('progress') || status.includes('doing') || status.includes('active') || 
      status.includes('development') || status.includes('implementation')) return IssueStatus.INPROGRESS;
  if (status.includes('done') || status.includes('complete') || status.includes('closed') || 
      status.includes('resolved') || status.includes('finished') || status.includes('verified')) return IssueStatus.DONE;
  
  return IssueStatus.BACKLOG; // default
};

// Map Jira issue types to board issue types for consistent coloring
const mapJiraTypeToBoardType = (jiraType) => {
  if (!jiraType) return IssueType.TASK;
  
  const type = jiraType.toLowerCase().trim();
  
  if (type.includes('bug') || type.includes('defect') || type.includes('error')) return IssueType.BUG;
  if (type.includes('story') || type.includes('feature') || type.includes('enhancement')) return IssueType.STORY;
  if (type.includes('task') || type.includes('sub-task') || type.includes('improvement') || 
      type.includes('chore') || type.includes('maintenance')) return IssueType.TASK;
  
  return IssueType.TASK; // default
};

/**
 * Normalized issue shape for unified IssueCard component
 * 
 * @typedef {Object} NormalizedIssue
 * @property {string} id - Unique identifier (board: issue.id, Jira: issue.key)
 * @property {string} [key] - Display key (e.g., "PRJ-123", "JIRA-456")
 * @property {string} title - Display title (board: issue.title, Jira: issue.summary)
 * @property {string} status - Status text for badge display
 * @property {string} type - Type text for badge display
 * @property {number} [priority] - Priority number 1-5 (board only)
 * @property {string} stripColor - Hex color for top priority/strip
 * @property {Array<Badge>} badges - Array of badges to display
 * @property {Array<Assignee>} assignees - Array of assignee objects
 * @property {string} [to] - Navigation URL (for board issues)
 * @property {Function} [onClick] - Click handler (for Jira issues)
 */

/**
 * @typedef {Object} Badge
 * @property {string} text - Badge display text
 * @property {string} bgColor - Background color (hex)
 * @property {string} textColor - Text color (hex)
 */

/**
 * @typedef {Object} Assignee
 * @property {string} [avatarUrl] - Avatar image URL
 * @property {string} name - Display name
 */

/**
 * Normalize a board issue for IssueCard component
 * 
 * @param {Object} issue - Board issue object
 * @param {Object} project - Project object
 * @param {Array<Object>} projectUsers - Array of user objects
 * @param {string} boardUrl - Base URL for navigation
 * @returns {NormalizedIssue} Normalized issue for IssueCard
 */
export const normalizeBoardIssue = (issue, project, projectUsers, boardUrl) => {
  const assignees = issue.userIds
    .map(userId => projectUsers.find(user => user.id === userId))
    .filter(Boolean)
    .map(user => ({
      id: user.id,
      avatarUrl: user.avatarUrl,
      name: user.name,
    }));

  const statusBg = issueStatusBackgroundColors[issue.status];
  const statusText = issueStatusColors[issue.status];
  const typeBg = getBoardIssueTypeBackground(issue.type);
  const typeText = issueTypeColors[issue.type] || '#374151';

  const priority = Number(issue.priority);
  const stripColor = priorityStripColor[priority] || '#e5e7eb';

  // Generate issue key like "PRJ-123"
  const prefix = project.key || (project.name || '').replace(/\W/g, '').slice(0, 4).toUpperCase() || 'PRJ';
  const issueKey = `${prefix}-${issue.id}`;

  return {
    id: issue.id.toString(),
    key: issueKey,
    title: issue.title,
    status: IssueStatusCopy[issue.status] || issue.status,
    type: IssueTypeCopy[issue.type] || issue.type,
    priority,
    stripColor,
    badges: [
      {
        text: IssueStatusCopy[issue.status] || issue.status,
        bgColor: statusBg,
        textColor: statusText,
      },
      {
        text: IssueTypeCopy[issue.type] || issue.type,
        bgColor: typeBg,
        textColor: typeText,
      },
    ],
    assignees,
    to: `${boardUrl}/issues/${issue.id}`,
  };
};

/**
 * Normalize a Jira issue for IssueCard component
 * 
 * @param {Object} issue - Jira IssueSummary object
 * @param {Function} onClickHandler - Click handler for time entry modal
 * @returns {NormalizedIssue} Normalized issue for IssueCard
 */
export const normalizeJiraIssue = (issue, onClickHandler) => {
  // Map Jira status/type to board equivalents for consistent coloring
  const boardStatus = mapJiraStatusToBoardStatus(issue.status);
  const boardType = mapJiraTypeToBoardType(issue.issueType);
  
  // Calculate board colors for badges (absolute visual consistency)
  const statusBg = issueStatusBackgroundColors[boardStatus];
  const statusText = issueStatusColors[boardStatus];
  const typeBg = getBoardIssueTypeBackground(boardType);
  const typeText = issueTypeColors[boardType] || '#374151';
  
  // Determine strip color based on issue type
  // Use Jira status colors mapping for type-based strip coloring
  const typeColors = getJiraStatusColors(issue.issueType);
  let stripColor = typeColors?.text;
  
  if (!stripColor) {
    // Fallback to board type colors
    const boardTypeToStripColor = {
      [IssueType.BUG]: '#dc2626',   // red
      [IssueType.STORY]: '#0d9488', // teal
      [IssueType.TASK]: '#3b82f6',  // blue
    };
    stripColor = boardTypeToStripColor[boardType] || '#94a3b8'; // default slate
  }

  const assignees = [];
  if (issue.assigneeDisplayName || issue.assigneeAvatarUrl) {
    assignees.push({
      avatarUrl: issue.assigneeAvatarUrl,
      name: issue.assigneeDisplayName || 'Me',
    });
  }

  const badges = [];
  
  // Status badge - use board status text for display, but show original Jira status
  if (issue.status) {
    badges.push({
      text: issue.status, // Show original Jira status text
      bgColor: statusBg,
      textColor: statusText,
    });
  }

  // Type badge - use board type text for display, but show original Jira type
  if (issue.issueType) {
    badges.push({
      text: issue.issueType, // Show original Jira type text
      bgColor: typeBg,
      textColor: typeText,
    });
  }

  return {
    id: issue.key,
    key: issue.key,
    title: issue.summary,
    status: issue.status,
    type: issue.issueType,
    stripColor,
    badges,
    assignees,
    onClick: onClickHandler,
  };
};

/**
 * Get background color for board issue type
 * @private
 */
const getBoardIssueTypeBackground = (type) => {
  const backgrounds = {
    task: '#dbeafe',
    bug: '#fee2e2',
    story: '#dcfce7',
  };
  return backgrounds[type] || '#f3f4f6';
};

/**
 * Get colors for Jira status/type using jiraStatusColors mapping
 * @private
 */
const getJiraStatusColors = (status) => {
  if (!status || typeof status !== 'string') return null;
  const key = status.toLowerCase().trim();
  return jiraStatusColors[key] || null;
};

/**
 * Get strip color based on priority (for board) or status (for Jira)
 * 
 * @param {number} [priority] - Priority number 1-5
 * @param {string} [status] - Status string for Jira issues
 * @returns {string} Hex color for strip
 */
export const getStripColor = (priority, status) => {
  if (priority !== undefined && priority !== null) {
    return priorityStripColor[priority] || '#e5e7eb';
  }
  
  if (status) {
    const colors = getJiraStatusColors(status);
    return colors?.text || '#94a3b8';
  }
  
  return '#e5e7eb';
};