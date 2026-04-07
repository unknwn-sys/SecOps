export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Local authentication routes
export const getLoginUrl = () => "/login";
export const getLogoutUrl = () => "/";

// JWT token management
export const JWT_TOKEN_KEY = "auth_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(JWT_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(JWT_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(JWT_TOKEN_KEY);
}
