import axios from 'axios';

import { navigationRef } from 'shared/utils/navigationRef';
import toast from 'shared/utils/toast';
import { objectToQueryString } from 'shared/utils/url';
import { getStoredAuthToken, removeStoredAuthToken } from 'shared/utils/authToken';

const defaults = {
  baseURL: process.env.API_URL || 'http://localhost:3824',
  headers: () => ({
    'Content-Type': 'application/json',
    Authorization: getStoredAuthToken() ? `Bearer ${getStoredAuthToken()}` : undefined,
  }),
  error: {
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please check your internet connection or contact our support.',
    status: 503,
    data: {},
  },
};

const api = (method, url, variables) =>
  new Promise((resolve, reject) => {
    axios({
      url: `${defaults.baseURL}${url}`,
      method,
      headers: defaults.headers(),
      params: method === 'get' ? variables : undefined,
      data: method !== 'get' ? variables : undefined,
      paramsSerializer: objectToQueryString,
    }).then(
      (response) => {
        resolve(response.data);
      },
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          const isUnauthorized = status === 401 || data?.error?.code === 'INVALID_TOKEN';

          if (isUnauthorized) {
            // Every auth failure uses the same envelope, so a missing token and
            // an expired one are indistinguishable here. Drop the token and
            // (re)authenticate, otherwise the app renders forever with no
            // credentials.
            removeStoredAuthToken();
            if (
              navigationRef.current &&
              typeof window !== 'undefined' &&
              window.location.pathname !== '/authenticate'
            ) {
              navigationRef.current('/authenticate');
            }
          }
          reject(data?.error ?? defaults.error);
        } else {
          reject(defaults.error);
        }
      },
    );
  });

const optimisticUpdate = async (url, { updatedFields, currentFields, setLocalData }) => {
  try {
    setLocalData(updatedFields);
    await api('put', url, updatedFields);
  } catch (error) {
    setLocalData(currentFields);
    toast.error(error);
  }
};

export default {
  get: (...args) => api('get', ...args),
  post: (...args) => api('post', ...args),
  put: (...args) => api('put', ...args),
  patch: (...args) => api('patch', ...args),
  delete: (...args) => api('delete', ...args),
  optimisticUpdate,
};
