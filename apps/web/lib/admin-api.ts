'use client';

import {API_URL} from './api';

export class AdminApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export async function adminRequest<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/admin${path}`, {...init, headers: {
      'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}), ...init?.headers
    }});
  } catch {
    throw new AdminApiError('Could not connect to the restaurant server. Please try again.', 0);
  }
  if (!response.ok) {const body = await response.json().catch(() => ({})); throw new AdminApiError(body.detail ?? 'Request failed', response.status);}
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function adminUpload<T>(path: string, token: string | null, body: FormData,
                                     method: 'POST' | 'PUT' = 'POST'): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/admin${path}`, {
      method, body, headers: token ? {Authorization: `Bearer ${token}`} : undefined
    });
  } catch {
    throw new AdminApiError('Could not connect to the restaurant server. Please try again.', 0);
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new AdminApiError(result.detail ?? 'Upload failed', response.status);
  }
  return response.json();
}
