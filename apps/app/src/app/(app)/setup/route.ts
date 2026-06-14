import { auth } from '@/utils/auth';
import { db } from '@db/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { createSetupSession } from './lib/setup-session';

async function canCreateOrganization(): Promise<boolean> {
  if (process.env.SELF_HOSTED_ALLOW_ORG_SETUP === 'true') {
    return true;
  }

  if (process.env.NEXT_PUBLIC_SELF_HOSTED !== 'true') {
    return true;
  }

  const organizationCount = await db.organization.count();
  return organizationCount === 0;
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Get search params from the request
  const searchParams = request.nextUrl.searchParams.toString();
  const queryString = searchParams ? `?${searchParams}` : '';

  if (!session?.user?.id) {
    redirect(`/auth${queryString}`);
  }

  if (!(await canCreateOrganization())) {
    redirect('/no-access');
  }

  const setupSession = await createSetupSession(session.user.id);
  redirect(`/setup/${setupSession.id}${queryString}`);
}
