import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Append the requester's email as a `?email=` query param for per-user API routes.
 * Returns the URL unchanged if email is absent (caller should gate on that instead).
 */
export function withEmail(url: string, email: string | null | undefined): string {
  if (!email) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}email=${encodeURIComponent(email)}`;
}
