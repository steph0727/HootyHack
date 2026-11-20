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
  } catch {
    throw new ApiError("Can't reach Hooty Hack right now. Check your connection and try again.", 0);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && authToken) onUnauthorized();
    throw new ApiError(messageFrom(data, res.status), res.status);
  }
  return data;
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
};
