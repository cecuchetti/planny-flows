import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

import { Container } from './Styles';

const propTypes = {
  items: PropTypes.array.isRequired,
};

function Breadcrumbs({ items }) {
  return (
    <Container>
      {items.map((item, index) => (
        <Fragment key={typeof item === 'object' ? item.label : item}>
          {index !== 0 && (
            <span className="material-symbols-outlined text-[14px] text-outline mx-[8px] relative top-[1px]">
              chevron_right
            </span>
          )}
          {typeof item === 'object' && item.to ? (
            <Link
              to={item.to}
              className="hover:text-primary transition-colors cursor-pointer"
            >
              {item.label}
            </Link>
          ) : (
            <span>{typeof item === 'object' ? item.label : item}</span>
          )}
        </Fragment>
      ))}
    </Container>
  );
}

Breadcrumbs.propTypes = propTypes;

export default Breadcrumbs;
