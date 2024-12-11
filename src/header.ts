// /source/headers.ts
// Header setting functions for rate-limiting middleware

import type { Response } from 'express';
import type { RateLimitInfo } from './types';

/**
 * Calculates the number of seconds left until the rate-limit window resets.
 * If `resetTime` is not provided, estimates using `windowMs`.
 *
 * @param resetTime - The timestamp when the rate limit resets.
 * @param windowMs - The duration of the rate-limit window in milliseconds.
 * @returns The number of seconds until the reset, or undefined if not applicable.
 */
const getResetSeconds = (
  resetTime?: Date,
  windowMs?: number,
): number | undefined => {
  if (resetTime) {
    const deltaSeconds = Math.ceil((resetTime.getTime() - Date.now()) / 1000);
    return Math.max(0, deltaSeconds);
  }

  if (windowMs) {
    return Math.ceil(windowMs / 1000);
  }

  return undefined;
};

/**
 * Sets the `RateLimit` and `RateLimit-Policy` headers based on the sixth draft
 * of the IETF rate-limiting specification.
 *
 * @param response - The Express response object to set headers on.
 * @param info - The rate limit information used to populate the headers.
 * @param windowMs - The duration of the rate-limit window in milliseconds.
 */
export const setDraft6Headers = (
  response: Response,
  info: RateLimitInfo,
  windowMs: number,
): void => {
  if (response.headersSent) return;

  const windowSeconds = Math.ceil(windowMs / 1000);
  const resetSeconds = getResetSeconds(info.resetTime);

  response.setHeader('RateLimit-Policy', `${info.limit};w=${windowSeconds}`);
  response.setHeader('RateLimit-Limit', info.limit.toString());
  response.setHeader('RateLimit-Remaining', info.remaining.toString());

  if (resetSeconds) {
    response.setHeader('RateLimit-Reset', resetSeconds.toString());
  }
};

/**
 * Sets the `RateLimit` and `RateLimit-Policy` headers based on the seventh draft
 * of the IETF rate-limiting specification.
 *
 * @param response - The Express response object to set headers on.
 * @param info - The rate limit information used to populate the headers.
 * @param windowMs - The duration of the rate-limit window in milliseconds.
 */
export const setDraft7Headers = (
  response: Response,
  info: RateLimitInfo,
  windowMs: number,
): void => {
  if (response.headersSent) return;

  const windowSeconds = Math.ceil(windowMs / 1000);
  const resetSeconds = getResetSeconds(info.resetTime, windowMs);

  response.setHeader('RateLimit-Policy', `${info.limit};w=${windowSeconds}`);
  response.setHeader(
    'RateLimit',
    `limit=${info.limit}, remaining=${info.remaining}, reset=${resetSeconds!}`,
  );
};

/**
 * Sets the `Retry-After` header on the response to indicate when the client
 * can send the next request after hitting the rate limit.
 *
 * @param response - The Express response object to set the header on.
 * @param info - The rate limit information used to determine the reset time.
 * @param windowMs - The duration of the rate-limit window in milliseconds.
 */
export const setRetryAfterHeader = (
  response: Response,
  info: RateLimitInfo,
  windowMs: number,
): void => {
  if (response.headersSent) return;

  const resetSeconds = getResetSeconds(info.resetTime, windowMs);
  response.setHeader('Retry-After', resetSeconds!.toString());
};
