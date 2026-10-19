import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  NO_PERMISSIONS,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { render, screen } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanySubmissionDetailPageClient } from './CompanySubmissionDetailPageClient';
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    permissions: {},
    hasPermission: mockHasPermission,
  }),
}));
const mockMutate = vi.fn();
let mockSwrData: unknown = undefined;
let mockSwrLoading = false;
let mockSwrError: unknown = null;
vi.mock('swr', () => ({
  default: vi.fn(() => ({
    data: mockSwrData,
    isLoading: mockSwrLoading,
    error: mockSwrError,
    mutate: mockMutate,
  })),
}));
vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: null, error: null }),
    patch: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));
vi.mock('@trycompai/design-system', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  Empty: ({ children }: PropsWithChildren) => <div>{children}</div>,
  EmptyDescription: ({ children }: PropsWithChildren) => <p>{children}</p>,
  EmptyHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
  EmptyMedia: ({ children }: PropsWithChildren) => <div>{children}</div>,
  EmptyTitle: ({ children }: PropsWithChildren) => <h3>{children}</h3>,
  Field: ({ children }: PropsWithChildren) => <div>{children}</div>,
  FieldLabel: ({ children }: PropsWithChildren) => <label>{children}</label>,
  Section: ({ children }: PropsWithChildren) => <section>{children}</section>,
  Table: ({ children }: PropsWithChildren) => <table>{children}</table>,
  TableBody: ({ children }: PropsWithChildren) => <tbody>{children}</tbody>,
  TableCell: ({ children }: PropsWithChildren) => <td>{children}</td>,
  TableHead: ({ children }: PropsWithChildren) => <th>{children}</th>,
  TableHeader: ({ children }: PropsWithChildren) => <thead>{children}</thead>,
  TableRow: ({ children }: PropsWithChildren) => <tr>{children}</tr>,
  Text: ({ children }: PropsWithChildren) => <span>{children}</span>,
  Textarea: (props: ComponentProps<'textarea'>) => <textarea {...props} />,
}));
vi.mock('@trycompai/design-system/icons', () => ({
  Document: () => <span data-testid="document-icon" />,
}));
vi.mock('./submission-utils', () => ({
  StatusBadge: ({ status }: { status: string }) => <span data-testid="status-badge">{status}</span>,
  formatSubmissionDate: () => '01/01/2025',
  isMatrixField: () => false,
  normalizeMatrixRows: () => [],
  renderSubmissionValue: (value: unknown) => String(value ?? '—'),
}));
vi.mock('react-markdown', () => ({
  default: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('remark-gfm', () => ({
  default: () => {},
}));
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const submissionProps = {
  organizationId: 'org-1',
  formType: 'access-request',
  submissionId: 'sub-1',
} as const;

function makeSubmissionData(
  overrides: {
    status?: string;
    formType?: string;
  } = {},
) {
  return {
    form: {
      title: 'Access Request',
      description: 'Access request form',
      type: overrides.formType ?? 'access-request',
      category: 'Security',
      submissionDateMode: 'auto',
      fields: [
        { key: 'submissionDate', label: 'Submission Date', type: 'date' },
        { key: 'reason', label: 'Reason', type: 'textarea' },
      ],
    },
    submission: {
      id: 'sub-1',
      submittedAt: '2025-01-01T00:00:00.000Z',
      status: overrides.status ?? 'pending',
      data: {
        submissionDate: '2025-01-01',
        reason: 'Need access for project',
      },
      submittedBy: {
        name: 'Test User',
        email: 'test@example.com',
      },
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
    },
  };
}
describe('CompanySubmissionDetailPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSwrData = undefined;
    mockSwrLoading = false;
    mockSwrError = null;
  });
  describe('Admin user with pending access-request', () => {
    beforeEach(() => {
      setMockPermissions(ADMIN_PERMISSIONS);
      mockSwrData = makeSubmissionData({ status: 'pending' });
    });
    it('renders the review section with Approve and Reject buttons', () => {
      render(<CompanySubmissionDetailPageClient {...submissionProps} />);
      expect(screen.getByText('Review this submission')).toBeInTheDocument();
      expect(screen.getByText('Approve')).toBeInTheDocument();
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
    it('renders the review reason textarea', () => {
      render(<CompanySubmissionDetailPageClient {...submissionProps} />);
      expect(screen.getByText('Reason (required for rejection)')).toBeInTheDocument();
    });
    it('checks evidence:update permission', () => {
      render(<CompanySubmissionDetailPageClient {...submissionProps} />);
      expect(mockHasPermission).toHaveBeenCalledWith('evidence', 'update');
    });
  });
  describe('Auditor user (read-only) with pending access-request', () => {
    beforeEach(() => {
      setMockPermissions(AUDITOR_PERMISSIONS);
      mockSwrData = makeSubmissionData({ status: 'pending' });
    });
    it('hides review section when auditor lacks evidence:update', () => {
      render(<CompanySubmissionDetailPageClient {...submissionProps} />);
      const canReview = mockHasPermission('evidence', 'update');
      if (!canReview) {
        expect(screen.queryByText('Review this submission')).not.toBeInTheDocument();
        expect(screen.queryByText('Approve')).not.toBeInTheDocument();
        expect(screen.queryByText('Reject')).not.toBeInTheDocument();
      }
    });
    it('still renders the submission details', () => {
      render(<CompanySubmissionDetailPageClient {...submissionProps} />);
      expect(screen.getByText('Submission Date')).toBeInTheDocument();
      expect(screen.getByText('Submitted By')).toBeInTheDocument();
    });
  });
  describe('No permissions with pending access-request', () => {
    beforeEach(() => {
      setMockPermissions(NO_PERMISSIONS);
      mockSwrData = makeSubmissionData({ status: 'pending' });
    });
    it('hides review section without evidence:update', () => {
      render(<CompanySubmissionDetailPageClient {...submissionProps} />);
      expect(screen.queryByText('Review this submission')).not.toBeInTheDocument();
      expect(screen.queryByText('Approve')).not.toBeInTheDocument();
      expect(screen.queryByText('Reject')).not.toBeInTheDocument();
    });
  });
  describe('Approved access-request (non-pending)', () => {
    beforeEach(() => {
      setMockPermissions(ADMIN_PERMISSIONS);
      mockSwrData = makeSubmissionData({ status: 'approved' });
    });
    it('does NOT render review section for already-reviewed submission', () => {
      render(<CompanySubmissionDetailPageClient {...submissionProps} />);
      expect(screen.queryByText('Review this submission')).not.toBeInTheDocument();
    });
  });
  describe('Non-access-request form type', () => {
    beforeEach(() => {
      setMockPermissions(ADMIN_PERMISSIONS);
      mockSwrData = makeSubmissionData({
        formType: 'meeting',
      });
    });
    it('does NOT render the review section', () => {
      render(<CompanySubmissionDetailPageClient {...submissionProps} formType="meeting" />);
      expect(screen.queryByText('Review this submission')).not.toBeInTheDocument();
    });
  });
  describe('Loading state', () => {
    it('shows loading text while fetching', () => {
      setMockPermissions(ADMIN_PERMISSIONS);
      mockSwrLoading = true;
      render(<CompanySubmissionDetailPageClient {...submissionProps} />);
      expect(screen.getByText('Loading submission...')).toBeInTheDocument();
    });
  });
  describe('Error state', () => {
    it('shows not found text on error', () => {
      setMockPermissions(ADMIN_PERMISSIONS);
      mockSwrError = new Error('Not found');
      render(<CompanySubmissionDetailPageClient {...submissionProps} />);
      expect(screen.getByText('Submission not found')).toBeInTheDocument();
    });
  });
});
