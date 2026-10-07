import React from 'react';
import PropTypes from 'prop-types';
import { Nav, NavLink } from './Styles';

const Sidebar = ({ items, active, onSelect }) => (
  <Nav aria-label="Navegación de préstamos">
    {items.map((item) => (
      <NavLink
        key={item.key}
        type="button"
        active={active === item.key}
        onClick={() => onSelect(item.key)}
      >
        {item.label}
      </NavLink>
    ))}
  </Nav>
);
Sidebar.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
  active: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
};
export default Sidebar;
