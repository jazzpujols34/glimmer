export const runtime = 'edge';

import { NextRequest } from 'next/server';
import { isValidEmail } from '@/lib/validation';
import { errorResponse, successResponse } from '@/lib/api-response';

const MAX_NAME_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 2000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, message } = body as {
      name?: string;
      email?: string;
      message?: string;
    };

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return errorResponse('請提供姓名 (Name is required)', 400, 'MISSING_FIELD', { field: 'name' });
    }
    if (name.trim().length > MAX_NAME_LENGTH) {
      return errorResponse(`姓名不得超過 ${MAX_NAME_LENGTH} 個字元`, 400, 'INVALID_INPUT');
    }

    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return errorResponse('請提供有效的 Email 地址', 400, 'INVALID_EMAIL');
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return errorResponse('請輸入訊息 (Message is required)', 400, 'MISSING_FIELD', { field: 'message' });
    }
    if (message.trim().length > MAX_MESSAGE_LENGTH) {
      return errorResponse(`訊息不得超過 ${MAX_MESSAGE_LENGTH} 個字元`, 400, 'INVALID_INPUT');
    }

    // Log the contact submission (wire up email sending later)
    console.log('[contact] New inquiry:', {
      name: name.trim(),
      email: email.trim(),
      messageLength: message.trim().length,
      timestamp: new Date().toISOString(),
    });

    return successResponse({ message: '訊息已送出 Message sent successfully' });
  } catch {
    return errorResponse('無法處理請求，請稍後再試', 400, 'INVALID_INPUT');
  }
}
