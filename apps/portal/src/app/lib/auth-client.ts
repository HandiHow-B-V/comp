import {
  emailOTPClient,
  multiSessionClient,
  organizationClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { ac, allRoles } from '@trycompai/auth';

const authBaseURL =
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
  (typeof window !== 'undefined' ? window.location.origin : undefined) ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3333';

export const authClient = createAuthClient({
  baseURL: authBaseURL,
  plugins: [
    organizationClient({ ac, roles: allRoles }),
    emailOTPClient(),
    multiSessionClient(),
  ],
});

export const {
  signIn,
  signOut,
  useSession,
  useActiveOrganization,
  organization,
  useListOrganizations,
  useActiveMember,
} = authClient;
