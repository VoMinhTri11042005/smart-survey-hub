import { auth } from '../services/firebase';

let configuredBase = import.meta.env.VITE_API_URL;
if (configuredBase && !configuredBase.endsWith('/api')) {
  configuredBase = configuredBase.endsWith('/') ? `${configuredBase}api` : `${configuredBase}/api`;
}
// Preserve the existing hosted-backend fallback for deployments that do not
// yet set VITE_API_URL. Same-origin deployments can explicitly use '/api'.
export const API_BASE = configuredBase || (import.meta.env.PROD ? 'https://smart-survey-hub.onrender.com/api' : '/api');

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const user = auth.currentUser;
  if (user) {
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  }
  return fetch(input, { ...init, headers });
}
