/* eslint-disable react/require-default-props */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';

/**
 * Context that holds the dynamic leaf label for the breadcrumb.
 *
 * The Loans shell renders a breadcrumb with CHILD_TITLES lookup as the last
 * segment. PersonDetail needs to display the person's NAME there, which is not
 * known until the API responds. This provider lets any child set the leaf.
 */
const BreadcrumbContext = createContext({
  leaf: '',
  setLeaf: () => {},
});

export function BreadcrumbLeafProvider({ children }) {
  const [leaf, setLeaf] = useState('');

  const value = useMemo(() => ({ leaf, setLeaf }), [leaf]);
  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

BreadcrumbLeafProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

/**
 * Hook that sets the breadcrumb leaf to `label` on mount and clears it on
 * unmount. Call from any page component that wants to override the static
 * CHILD_TITLES entry.
 */
export function useBreadcrumbLeaf(label) {
  const { setLeaf } = useContext(BreadcrumbContext);

  useEffect(() => {
    setLeaf(label);
    return () => setLeaf('');
  }, [label, setLeaf]);
}

export default BreadcrumbContext;
