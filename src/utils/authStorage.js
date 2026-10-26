// src/utils/authStorage.js
const TOKEN_KEY = 'aml_token';
const USER_KEY  = 'aml_user';
const SOURCE_KEY = 'aml_userSource';

export function setSession({ token, user, userSource }) {
  sessionStorage.setItem(TOKEN_KEY, token || '');
  sessionStorage.setItem(USER_KEY, JSON.stringify(user || {}));
  sessionStorage.setItem(SOURCE_KEY, userSource || user?.userSource || '');
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(SOURCE_KEY);
}

export function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function getStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || '{}');
  } catch {
    return {};
  }
}

export function getStoredUserSource() {
  return sessionStorage.getItem(SOURCE_KEY) || '';
}