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
  | 'EMAIL_NOT_VERIFIED'
  | 'INSUFFICIENT_CREDITS'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'SERVER_ERROR'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'FREE_TIER_STANDARD_SPEC_ONLY'
  | 'FREE_TIER_IP_CAP'
  | 'SESSION_REQUIRED';

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

  // Phase 2b (docs/oauth-identity-design.html §5): this account has
  // established a session (signed in at least once) — REQUIRE_SESSION_FOR_PAID
  // no longer allows spend/destructive actions via a typed email alone.
  sessionRequired: () =>
    errorResponse('此帳號已綁定登入，請使用 Google 或信箱登入後繼續', 401, 'SESSION_REQUIRED'),

  emailNotVerified: () =>
    errorResponse('請先驗證您的 Email 地址', 403, 'EMAIL_NOT_VERIFIED'),

  insufficientCredits: (needed?: number, have?: number) =>
    errorResponse(
      needed !== undefined && have !== undefined
        ? `點數不足：本次生成需要 ${needed} 點，您目前僅有 ${have} 點，請購買點數後再試`
        : '點數不足，請購買點數後再試',
      402,
      'INSUFFICIENT_CREDITS',
      needed !== undefined && have !== undefined ? { needed, have } : undefined
    ),

  notFound: (resource: string) =>
    errorResponse(`找不到該${resource}`, 404, 'NOT_FOUND', { resource }),

  rateLimited: (retryAfter: number) =>
    NextResponse.json(
      { error: '請求過於頻繁，請稍後再試', code: 'RATE_LIMITED' } as ErrorResponse,
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    ),

  serverError: () =>
    errorResponse('發生錯誤，請稍後再試', 500, 'SERVER_ERROR'),

  serviceUnavailable: () =>
    errorResponse(
      '影片生成服務暫時無法使用，工程團隊已收到通知，請稍後再試',
      503,
      'PROVIDER_UNAVAILABLE'
    ),

  dailySpendCapReached: () =>
    errorResponse(
      '今日系統生成額度已滿，請稍後或明日再試',
      503,
      'PROVIDER_UNAVAILABLE'
    ),

  invalidInput: (message: string) =>
    errorResponse(message, 400, 'INVALID_INPUT'),

  // Free tier only covers the standard spec (720p / 5s / x1 — the exact
  // settings that make creditsForGeneration() === 1). Any request that would
  // consume a free credit but costs more than 1 must be paid entirely from
  // paid credits (see consumeCredits() in credits.ts) — this is what a caller
  // hits when paid credits alone can't cover a non-standard-spec generation.
  freeTierStandardSpecOnly: () =>
    errorResponse(
      '免費額度僅支援標準規格（720p・5 秒・1 部）。購買點數即可解鎖完整畫質與更多選項',
      402,
      'FREE_TIER_STANDARD_SPEC_ONLY'
    ),

  // Per-IP monthly cap on free-tier generations (FREE_IP_MONTHLY_CAP in
  // free-ip-cap.ts) — stops one network/NAT farming many emails to keep
  // re-triggering the free tier.
  freeTierIpCapReached: () =>
    errorResponse(
      '此網路環境的免費額度已用完，購買點數即可繼續生成',
      429,
      'FREE_TIER_IP_CAP'
    ),
};
