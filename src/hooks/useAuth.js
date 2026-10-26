import { useEffect, useState } from 'react';
import React from 'react';
import apiClient from '../api/apiClient';

export function useAuth() {
  const [state, setState] = useState({
    isAuthenticated: apiClient.auth.isAuthenticated(),
    token:           apiClient.auth.token(),
    user:            apiClient.auth.currentUser(),
  });

  useEffect(() => {
    // onChange fires immediately with the current state, then on
    // every login/logout.
    const unsub = apiClient.auth.onChange((next) => setState(next));
    return unsub;
  }, []);

  return {
    ...state,
    logout: apiClient.auth.logout,
  };
}