import Constants from 'expo-constants';
import { Platform } from 'react-native';

// API location: EXPO_PUBLIC_API_URL wins; otherwise use the same machine as the Expo dev
// server (works for the web build, simulators, and phones on the same Wi-Fi).
function resolveBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `http://${window.location.hostname}:8000`;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
}

export const API_URL = resolveBaseUrl();

let authToken = null;
let onUnauthorized = () => {};
export const setAuthToken = (t) => { authToken = t; };
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

function messageFrom(body, status) {
  const d = body?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d.length) return d[0].msg?.replace(/^Value error, /, '') || 'Please check the form.';
  return status >= 500 ? 'Something went wrong on our end. Please try again.' : 'Request failed.';
}

const UNREACHABLE = "Can't reach Hooty Swipe right now. Check your connection and try again.";

function finish(status, data) {
  if (status === 204) return null;
  if (status >= 200 && status < 300) return data;
  if (status === 401 && authToken) onUnauthorized();
  throw new ApiError(messageFrom(data, status), status);
}

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (__DEV__) console.warn(`[api] ${method} ${path} failed:`, e);
    throw new ApiError(UNREACHABLE, 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return finish(res.status, data);
}

// File uploads go through XMLHttpRequest, not fetch. On iOS/Android, Expo replaces the
// global fetch with expo/fetch, which can't send React Native's { uri, name, type } file
// parts (it throws before any request is made). XMLHttpRequest uses React Native's own
// networking, which streams the file from its local uri. On web it sends the File as-is.
function upload(path, { method = 'PUT', form, timeoutMs = 120000 }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_URL}${path}`);
    xhr.setRequestHeader('Accept', 'application/json');
    if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    // Don't set Content-Type: the multipart boundary is added automatically.
    xhr.timeout = timeoutMs;
    xhr.onload = () => {
      if (xhr.status === 0) return reject(new ApiError(UNREACHABLE, 0));
      let data = null;
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch {}
      try { resolve(finish(xhr.status, data)); } catch (e) { reject(e); }
    };
    xhr.onerror = () => {
      if (__DEV__) console.warn(`[api] upload ${method} ${path} failed (network error)`);
      reject(new ApiError(UNREACHABLE, 0));
    };
    xhr.ontimeout = () => reject(new ApiError('The upload took too long. Try a smaller file or a stronger connection.', 0));
    xhr.send(form);
  });
}

// `file` is an asset from expo-document-picker.
async function flyerForm(file) {
  const form = new FormData();
  const type = file.mimeType || 'application/octet-stream';
  if (Platform.OS === 'web') {
    // The web picker gives a real File; fall back to reading the blob: uri.
    const blob = file.file || (await (await fetch(file.uri)).blob());
    form.append('file', blob, file.name);
  } else {
    form.append('file', { uri: file.uri, name: file.name || 'flyer', type });
  }
  return form;
}

export const api = {
  register: (b) => request('/auth/register', { method: 'POST', body: b }),
  login: (b) => request('/auth/login', { method: 'POST', body: b }),
  me: () => request('/me'),
  updateMe: (b) => request('/me', { method: 'PATCH', body: b }),
  changePassword: (b) => request('/me/password', { method: 'POST', body: b }),
  resetSkips: () => request('/me/swipes/reset', { method: 'POST' }),
  categories: () => request('/categories'),
  feed: ({ filter = 'for_you', campus } = {}) =>
    request(`/events/feed?filter=${filter}${campus ? `&campus=${campus}` : ''}&limit=30`),
  event: (id) => request(`/events/${id}`),
  swipe: (id, direction) => request(`/events/${id}/swipe`, { method: 'POST', body: { direction } }),
  saved: () => request('/saved'),
  save: (id) => request(`/saved/${id}`, { method: 'POST' }),
  unsave: (id) => request(`/saved/${id}`, { method: 'DELETE' }),
  categoryFeedback: (id, category, is_correct) =>
    request(`/events/${id}/categories/feedback`, { method: 'POST', body: { category, is_correct } }),

  // Admin: create & edit events
  adminEvents: ({ q = '', when = 'upcoming' } = {}) =>
    request(`/admin/events?when=${when}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  adminEvent: (id) => request(`/admin/events/${id}`),
  createEvent: (b) => request('/admin/events', { method: 'POST', body: b }),
  updateEvent: (id, b) => request(`/admin/events/${id}`, { method: 'PATCH', body: b }),
  deleteEvent: (id) => request(`/admin/events/${id}`, { method: 'DELETE' }),
  // `file` is an asset from expo-document-picker.
  uploadFlyer: async (id, file) => upload(`/admin/events/${id}/flyer`, { form: await flyerForm(file) }),
  removeFlyer: (id) => request(`/admin/events/${id}/flyer`, { method: 'DELETE' }),

  // Admin: club accounts (a club signs in and manages its own events)
  clubs: () => request('/admin/clubs'),
  clubAccounts: () => request('/admin/club-accounts'),
  clubAccount: (id) => request(`/admin/club-accounts/${id}`),
  createClubAccount: (b) => request('/admin/club-accounts', { method: 'POST', body: b }),
  updateClubAccount: (id, b) => request(`/admin/club-accounts/${id}`, { method: 'PATCH', body: b }),
  deleteClubAccount: (id) => request(`/admin/club-accounts/${id}`, { method: 'DELETE' }),
};
