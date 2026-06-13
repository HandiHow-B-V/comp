import { env } from '@/env.mjs';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_BASE =
  env.BACKEND_API_URL || env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

type AuthRouteContext = {
  params: Promise<{ auth: string[] }> | { auth: string[] };
};

async function proxyAuthRequest(
  req: NextRequest,
  context: AuthRouteContext,
): Promise<Response> {
  const params = await context.params;
  const authPath = params.auth.map(encodeURIComponent).join('/');
  const upstreamUrl = new URL(`${API_BASE}/api/auth/${authPath}`);
  upstreamUrl.search = req.nextUrl.search;

  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('content-length');

  const response = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body:
      req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : await req.arrayBuffer(),
    redirect: 'manual',
    cache: 'no-store',
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('set-cookie');

  for (const cookie of response.headers.getSetCookie()) {
    responseHeaders.append('Set-Cookie', cookie);
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export async function GET(
  req: NextRequest,
  context: AuthRouteContext,
): Promise<Response> {
  return proxyAuthRequest(req, context);
}

export async function POST(
  req: NextRequest,
  context: AuthRouteContext,
): Promise<Response> {
  return proxyAuthRequest(req, context);
}

export async function PUT(
  req: NextRequest,
  context: AuthRouteContext,
): Promise<Response> {
  return proxyAuthRequest(req, context);
}

export async function PATCH(
  req: NextRequest,
  context: AuthRouteContext,
): Promise<Response> {
  return proxyAuthRequest(req, context);
}

export async function DELETE(
  req: NextRequest,
  context: AuthRouteContext,
): Promise<Response> {
  return proxyAuthRequest(req, context);
}
