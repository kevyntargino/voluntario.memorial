const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function buildApiUrl(path) {
  return new URL(path, API_BASE_URL).toString();
}
