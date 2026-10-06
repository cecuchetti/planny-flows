import get from 'lodash/get';

import useApi from 'shared/hooks/api';

const useCurrentUser = ({ cachePolicy = 'cache-only' } = {}) => {
  const [{ data }] = useApi.get('/currentUser', {}, { cachePolicy });

  return {
    currentUser: get(data, 'currentUser'),
    currentUserId: get(data, 'currentUser.id'),
    /**
     * Whether the current user may reach administrative surfaces.
     *
     * A display hint only. The runtime configuration routes are not even mounted
     * unless an administrator is configured, so hiding a link is convenience, not
     * access control.
     */
    isAdmin: get(data, 'currentUser.isAdmin', false),
  };
};

export default useCurrentUser;
