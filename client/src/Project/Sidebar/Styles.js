import styled from 'styled-components';
import { Link } from 'react-router-dom';

/*
 * `data-testid` is here because this aside is not the only one on the page:
 * `NavbarLeft` renders one too, so a bare `aside` selector is ambiguous and
 * `cy.within()` refuses it.
 *
 * Minimal styled wrappers — actual styling lives in Tailwind classes on the JSX.
 * These exist only to set the correct HTML element (aside, Link) and data attributes.
 */
export const Sidebar = styled.aside.attrs({ 'data-testid': 'project:sidebar' })``;

export const LinkItem = styled(Link)``;

export const DisabledItem = styled.div``;

/* kept for import compatibility — no longer used visually */
export const MobileHeader = styled.div``;
export const NavSection = styled.div``;
export const SectionLabel = styled.div``;
export const Divider = styled.div``;
export const NavIcon = styled.span``;
export const LinkText = styled.span``;
export const ProjectInfo = styled.div``;
export const ProjectAvatar = styled.div``;
export const ProjectTexts = styled.div``;
export const ProjectName = styled.div``;
export const ProjectCategory = styled.div``;
