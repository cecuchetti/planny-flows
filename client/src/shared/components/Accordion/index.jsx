/* eslint-disable react/require-default-props -- optional props are read, never required */
import React, { useId, useState } from 'react';
import PropTypes from 'prop-types';

import Icon from '../Icon';
import { Badge, Chevron, Header, Panel, Subtitle, Title, Titles, Wrapper } from './Styles';

/**
 * A collapsible section.
 *
 * Used by the settings page, where the number of sections is driven by the
 * configuration registry: without collapsing, the page grew long enough that the
 * section an operator needed was always off screen.
 *
 * The header is a real ``<button>`` with ``aria-expanded`` and ``aria-controls``,
 * so it is reachable and operable by keyboard and announced correctly.
 */
function Accordion({ title, subtitle, badge, badgeTone, defaultOpen, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <Wrapper>
      <Header
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <Chevron $isOpen={isOpen}>
          <Icon type="chevron-down" size={12} />
        </Chevron>
        <Titles>
          <Title>{title}</Title>
          {subtitle && <Subtitle>{subtitle}</Subtitle>}
        </Titles>
        {badge && <Badge tone={badgeTone}>{badge}</Badge>}
      </Header>

      {isOpen && <Panel id={panelId}>{children}</Panel>}
    </Wrapper>
  );
}

Accordion.propTypes = {
  title: PropTypes.node.isRequired,
  subtitle: PropTypes.node,
  badge: PropTypes.node,
  badgeTone: PropTypes.oneOf(['warn', 'ok', 'info']),
  defaultOpen: PropTypes.bool,
  children: PropTypes.node,
};

export default Accordion;
