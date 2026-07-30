export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { createProject, getAllProjects } from '@/lib/storage';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';
import { errors } from '@/lib/api-response';
import { getRequesterEmail } from '@/lib/owner';
import { isAdmin } from '@/lib/credits';

function requireRequesterEmail(request: NextRequest) {
  const requesterEmail = getRequesterEmail(request);
  if (!requesterEmail) {
    return request.nextUrl.searchParams.get('email')
      ? errors.invalidEmail()
      : errors.missingField('email');
  }
  return requesterEmail;
}

// GET /api/projects - List all projects
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`projects:${ip}`, 30, 60);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, rateCheck.resetAt - Math.floor(Date.now() / 1000));
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const requesterEmail = requireRequesterEmail(request);
    if (typeof requesterEmail !== 'string') return requesterEmail;

    // Admins see every project; everyone else only sees their own
    const projects = await getAllProjects(isAdmin(requesterEmail) ? undefined : requesterEmail);
    return NextResponse.json({ projects });
  } catch (error) {
    captureError(error, { route: '/api/projects' });
    return NextResponse.json({ error: '發生錯誤' }, { status: 500 });
  }
}

// POST /api/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(`projects:create:${ip}`, 10, 60);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const requesterEmail = requireRequesterEmail(request);
    if (typeof requesterEmail !== 'string') return requesterEmail;

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: '請提供專案名稱' }, { status: 400 });
    }

    if (name.length > 100) {
      return NextResponse.json({ error: '專案名稱不得超過 100 個字元' }, { status: 400 });
    }

    // Owner is always the authenticated requester — no client-supplied owner override
    const project = await createProject(name.trim(), requesterEmail, description);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    captureError(error, { route: '/api/projects' });
    return NextResponse.json({ error: '發生錯誤' }, { status: 500 });
  }
}
