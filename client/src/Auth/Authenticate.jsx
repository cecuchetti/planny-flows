import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import api from 'shared/utils/api';
import toast from 'shared/utils/toast';
import { getStoredAuthToken, storeAuthToken } from 'shared/utils/authToken';
import { PageLoader } from 'shared/components';

const Authenticate = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const createGuestAccount = async () => {
      try {
        const { authToken } = await api.post('/authentication/guest');
        storeAuthToken(authToken);
        navigate('/');
      } catch (error) {
        toast.error(error);
      }
    };

    if (getStoredAuthToken()) {
      // Already authenticated (e.g. landed here directly) - don't spin forever.
      navigate('/', { replace: true });
      return;
    }

    createGuestAccount();
  }, [navigate]);

  return <PageLoader />;
};

export default Authenticate;
