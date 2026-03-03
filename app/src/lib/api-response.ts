/**
 * Standardized API response utilities.
 * Provides consistent error/success response formats across all API routes.
 */

import { NextResponse } from 'next/server';

// Error codes for programmatic handling
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'MISSING_FIELD'
  | 'INVALID_EMAIL'
  | 'INSUFFICIENT_CREDITS'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'SERVER_ERROR'
  | 'PROVIDER_ERROR';

export interface ErrorResponse {
  error: string;
  code?: ErrorCode;
  details?: Record<string, unknown>;
}

export interface SuccessResponse<T = unknown> {
  success: true;
  data?: T;
}

/**
 * Create a standardized error response.
 */
export function errorResponse(
  message: string,
  status: number,
  code?: ErrorCode,
  details?: Record<string, unknown>
): NextResponse<ErrorResponse> {
  const body: ErrorResponse = { error: message };
  if (code) body.code = code;
  if (details) body.details = details;
  return NextResponse.json(body, { status });
}

/**
 * Create a standardized success response.
 */
export function successResponse<T>(
  data?: T,
  status = 200
): NextResponse<SuccessResponse<T> | T> {
  if (data === undefined) {
    return NextResponse.json({ success: true }, { status });
  }
  return NextResponse.json(data, { status });
}

// Common error responses
export const errors = {
  missingField: (field: string) =>
    errorResponse(`缺少必要欄位: ${field}`, 400, 'MISSING_FIELD', { field }),

  invalidEmail: () =>
    errorResponse('請提供有效的 Email 地址', 400, 'INVALID_EMAIL'),

  insufficientCredits: () =>
    errorResponse('點數不足，請購買點數後再試', 402, 'INSUFFICIENT_CREDITS'),

  notFound: (resource: string) =>
    errorResponse(`找不到該${resource}`, 404, 'NOT_FOUND', { resource }),

  rateLimited: (retryAfter: number) =>
    NextResponse.json(
      { error: '請求過於頻繁，請稍後再試', code: 'RATE_LIMITED' } as ErrorResponse,
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    ),

  serverError: () =>
    errorResponse('發生錯誤，請稍後再試', 500, 'SERVER_ERROR'),

  invalidInput: (message: string) =>
    errorResponse(message, 400, 'INVALID_INPUT'),
};
