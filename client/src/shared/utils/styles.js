import { css } from 'styled-components';
import Color from 'color';

import { IssueType, IssueStatus, IssuePriority } from 'shared/constants/issues';

export const color = {
  primary: '#3b6cf0',      // Blue — used sparingly (buttons, links, ticket key)
  success: '#16a34a',      // Green
  danger: '#dc2626',       // Red
  warning: '#d97706',      // Amber
  secondary: '#f3f4f6',

  textDarkest: '#111827',  // Near-black titles
  textDark: '#374151',
  textMedium: '#6b7280',
  textLight: '#9ca3af',
  textLink: '#3b6cf0',

  backgroundDarkPrimary: '#1e293b',
  backgroundMedium: '#e5e7eb',
  backgroundLight: '#f3f4f6',    // Column background (transparent now, but kept as token)
  backgroundLightest: '#f9fafb', // Card background — very light, barely-there gray
  backgroundLightPrimary: '#eff6ff',
  backgroundLightSuccess: '#f0fdf4',

  // Gradient page background
  gradientStart: '#fce7f3',
  gradientEnd: '#ede9fe',

  borderLightest: '#e5e7eb',
  borderLight: '#d1d5db',
  borderInputFocus: '#3b6cf0',

  // Status badge colors (pastel backgrounds with saturated text/borders)
  statusSuccess: {
    bg: '#dcfce7',
    text: '#166534',
    border: '#86efac',
  },
  statusWarning: {
    bg: '#fef3c7',
    text: '#92400e',
    border: '#fcd34d',
  },
  statusError: {
    bg: '#fef2f2',
    text: '#991b1b',
    border: '#fecaca',
  },
  statusViolet: {
    bg: '#ede9fe',
    text: '#6d28d9',
    border: '#c4b5fd',
  },

  // Violet gradient for decorative headers
  violetGradientStart: '#f5f3ff',
  violetGradientEnd: '#ede9fe',
  violetBorderLight: '#ddd6fe',
};

export const issueTypeColors = {
  [IssueType.TASK]: '#3b82f6', // blue
  [IssueType.BUG]: '#dc2626', // red
  [IssueType.STORY]: '#0d9488', // green/teal
};

export const issuePriorityColors = {
  [IssuePriority.HIGHEST]: '#b91c1c', // red
  [IssuePriority.HIGH]: '#ea580c', // orange
  [IssuePriority.MEDIUM]: '#d97706', // amber
  [IssuePriority.LOW]: '#ca8a04', // yellow
  [IssuePriority.LOWEST]: '#65a30d', // lime
};

export const issueStatusColors = {
  [IssueStatus.BACKLOG]:    '#374151',
  [IssueStatus.INPROGRESS]: '#1d4ed8',
  [IssueStatus.SELECTED]:   '#6d28d9',
  [IssueStatus.DONE]:       '#15803d',
};

export const issueStatusBackgroundColors = {
  [IssueStatus.BACKLOG]:    '#f3f4f6',  // Soft gray
  [IssueStatus.INPROGRESS]: '#dbeafe',  // Soft blue
  [IssueStatus.SELECTED]:   '#ede9fe',  // Soft violet
  [IssueStatus.DONE]:       '#dcfce7',  // Soft green
};

/**
 * Pastel badge palette (Asana-style):
 * Soft background + saturated text — no full-color fills
 */
export const jiraStatusColors = {
  // ── Workflow statuses ────────────────────────────────
  open:                   { bg: '#dbeafe', text: '#1e40af' },
  closed:                 { bg: '#f3f4f6', text: '#4b5563' },
  'code review':          { bg: '#ede9fe', text: '#6d28d9' },
  'pending qa':           { bg: '#ffedd5', text: '#c2410c' },
  'dev in progress':      { bg: '#dcfce7', text: '#15803d' },
  'pending deployment':   { bg: '#cffafe', text: '#0e7490' },
  'clarification needed': { bg: '#fef9c3', text: '#854d0e' },
  // ── Issue types ──────────────────────────────────────
  improvement:  { bg: '#fce7f3', text: '#9d174d' },
  'new feature':{ bg: '#f3e8ff', text: '#7e22ce' },
  bug:          { bg: '#fee2e2', text: '#b91c1c' },
  task:         { bg: '#dbeafe', text: '#1e40af' },
  'sub-task':   { bg: '#f3f4f6', text: '#4b5563' },
  story:        { bg: '#dcfce7', text: '#166534' },
  epic:         { bg: '#ede9fe', text: '#6d28d9' },
};

export const sizes = {
  appNavBarLeftWidth: 64,
  secondarySideBarWidth: 268,
  minViewportWidth: 1000,
  mobileTopBarHeight: 56,
  mobileBottomNavHeight: 64,
};

export const breakpoints = {
  mobile: 480,
  tablet: 768,
  laptop: 1024,
};

export const media = {
  mobile: `@media (max-width: ${breakpoints.mobile}px)`,
  tablet: `@media (max-width: ${breakpoints.tablet}px)`,
  laptop: `@media (max-width: ${breakpoints.laptop}px)`,
  belowTablet: `@media (max-width: ${breakpoints.tablet - 1}px)`,
  belowLaptop: `@media (max-width: ${breakpoints.laptop - 1}px)`,
};

export const radius = {
  small: 6,
  medium: 10,
  large: 16,
  xlarge: 24,
  pill: 9999,
};

export const zIndexValues = {
  modal: 1000,
  dropdown: 101,
  navLeft: 100,
};

/** Type scale aligned with modern task-management UI (clear hierarchy, readable) */
export const fontSizes = {
  pageTitle: 22,
  sectionTitle: 16,
  body: 15,
  bodySmall: 14,
  caption: 13,
  overline: 11,
};

export const lineHeights = {
  tight: 1.25,
  snug: 1.35,
  normal: 1.5,
  relaxed: 1.6,
};

export const font = {
  regular: 'font-family: "CircularStdBook", "Inter", system-ui, sans-serif; font-weight: normal;',
  medium: 'font-family: "CircularStdMedium", "Inter", system-ui, sans-serif; font-weight: 500;',
  bold: 'font-family: "CircularStdBold", "Inter", system-ui, sans-serif; font-weight: 600;',
  black: 'font-family: "CircularStdBlack", "Inter", system-ui, sans-serif; font-weight: 700;',
  size: size => `font-size: ${size}px;`,
  /** Combined size + line-height for consistent text blocks */
  text: (size, lineHeight = lineHeights.normal) => `
    font-size: ${size}px;
    line-height: ${lineHeight};
  `,
};

export const mixin = {
  darken: (colorValue, amount) =>
    Color(colorValue)
      .darken(amount)
      .string(),
  lighten: (colorValue, amount) =>
    Color(colorValue)
      .lighten(amount)
      .string(),
  rgba: (colorValue, opacity) =>
    Color(colorValue)
      .alpha(opacity)
      .string(),
  boxShadowMedium: css`
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  `,
  boxShadowCard: css`
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 4px 10px -5px rgba(0, 0, 0, 0.04);
  `,
  boxShadowDropdown: css`
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
  `,
  truncateText: css`
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  `,
  clickable: css`
    cursor: pointer;
    user-select: none;
  `,
  hardwareAccelerate: css`
    transform: translateZ(0);
  `,
  cover: css`
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
  `,
  placeholderColor: colorValue => css`
    ::-webkit-input-placeholder {
      color: ${colorValue} !important;
      opacity: 1 !important;
    }
    :-moz-placeholder {
      color: ${colorValue} !important;
      opacity: 1 !important;
    }
    ::-moz-placeholder {
      color: ${colorValue} !important;
      opacity: 1 !important;
    }
    :-ms-input-placeholder {
      color: ${colorValue} !important;
      opacity: 1 !important;
    }
  `,
  scrollableY: css`
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  `,
  customScrollbar: ({ width = 8, background = color.backgroundMedium } = {}) => css`
    &::-webkit-scrollbar {
      width: ${width}px;
    }
    &::-webkit-scrollbar-track {
      background: none;
    }
    &::-webkit-scrollbar-thumb {
      border-radius: 99px;
      background: ${background};
    }
  `,
  backgroundImage: imageURL => css`
    background-image: url("${imageURL}");
    background-position: 50% 50%;
    background-repeat: no-repeat;
    background-size: cover;
    background-color: ${color.backgroundLight};
  `,
  link: (colorValue = color.textLink) => css`
    cursor: pointer;
    color: ${colorValue};
    ${font.medium}
    &:hover, &:visited, &:active {
      color: ${colorValue};
    }
    &:hover {
      text-decoration: underline;
    }
  `,
  tag: (background = color.backgroundMedium, colorValue = color.textDarkest) => css`
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 10px;
    border-radius: 999px;
    cursor: pointer;
    user-select: none;
    color: ${colorValue};
    background: ${background};
    ${font.medium}
    ${font.size(fontSizes.caption)}
    line-height: 1;
    letter-spacing: 0.01em;
    i {
      margin-left: 4px;
    }
  `,
};
