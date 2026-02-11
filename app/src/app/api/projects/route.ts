export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { createProject, getAllProjects } from '@/lib/storage';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { captureError } from '@/lib/errors';

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

    const { searchParams } = request.nextUrl;
    const email = searchParams.get('email') || undefined;

    const projects = await getAllProjects(email);
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

    const body = await request.json();
    const { name, email, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: '請提供專案名稱' }, { status: 400 });
    }

    if (name.length > 100) {
      return NextResponse.json({ error: '專案名稱不得超過 100 個字元' }, { status: 400 });
    }

    const project = await createProject(name.trim(), email, description);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    captureError(error, { route: '/api/projects' });
    return NextResponse.json({ error: '發生錯誤' }, { status: 500 });
  }
}
