import { queryStringToObject, addToQueryString, omitFromQueryString } from 'shared/utils/url';

const open = (param, navigate, location) =>
  navigate({
    pathname: location.pathname,
    search: addToQueryString(location.search, { [`modal-${param}`]: true }),
  });

const close = (param, navigate, location) =>
  navigate({
    pathname: location.pathname,
    search: omitFromQueryString(location.search, [`modal-${param}`]),
  });

const isOpen = (param, location) =>
  !!queryStringToObject(location.search)[`modal-${param}`];

export const createQueryParamModalHelpers = (param, navigate, location) => ({
  open: () => open(param, navigate, location),
  close: () => close(param, navigate, location),
  isOpen: () => isOpen(param, location),
});
