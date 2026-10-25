import type { LocalBucket, LocalDatabase } from './local-store';

declare global {
  interface Window {
    Android?: {
      getGithubToken(): string;
      setGithubToken(token: string): boolean;
      [key: string]: unknown;
    };
  }
}

let developmentToken = '';

function githubToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    if (window.Android?.getGithubToken) return window.Android.getGithubToken() || '';
  } catch {
    // An unavailable secure bridge must never fall back to persisted web data.
    return '';
  }
  return developmentToken;
}

/** Android persists credentials in its secure bridge; browser development is session-only. */
export function setGithubToken(token: string): boolean {
  const normalized = token.trim();
  if (typeof window !== 'undefined' && window.Android?.setGithubToken) {
    try { return window.Android.setGithubToken(normalized) === true; }
    catch { return false; }
  }
  developmentToken = normalized;
  return true;
}

export function clearGithubToken(): boolean { return setGithubToken(''); }
export function hasGithubToken(): boolean { return githubToken().length > 0; }

/** Stable object shared by the original route handlers after initializeStorage(). */
export const env: {
  DB?: LocalDatabase;
  BUCKET?: LocalBucket;
  readonly 'Github-Token': string;
  readonly GITHUB_READ_TOKEN: string;
} = {
  get 'Github-Token'() { return githubToken(); },
  get GITHUB_READ_TOKEN() { return githubToken(); },
};
