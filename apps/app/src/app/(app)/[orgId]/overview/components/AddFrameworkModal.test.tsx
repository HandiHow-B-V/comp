import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  NO_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    permissions: {},
    hasPermission: mockHasPermission,
  }),
}));

const mockAddFrameworks = vi.fn();
vi.mock('@/hooks/use-frameworks', () => ({
  useFrameworks: () => ({
    addFrameworks: mockAddFrameworks,
    frameworks: [],
    isLoading: false,
    error: null,
    mutate: vi.fn(),
    deleteFramework: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('@trycompai/design-system', () => ({
  Button: ({
    children,
    loading: _loading,
    size: _size,
    variant: _variant,
    ...props
  }: PropsWithChildren<
    ButtonHTMLAttributes<HTMLButtonElement> & {
      loading?: boolean;
      size?: string;
      variant?: string;
    }
  >) => <button {...props}>{children}</button>,
  Spinner: () => <span role="status">Adding frameworks</span>,
}));

vi.mock('@trycompai/ui/dialog', () => ({
  DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({ children }: PropsWithChildren) => <p>{children}</p>,
  DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock('@/components/framework-card', () => ({
  FrameworkCard: ({
    framework,
    isSelected,
    onSelectionChange,
  }: {
    framework: { id: string; name: string };
    isSelected: boolean;
    onSelectionChange: (checked: boolean) => void;
  }) => (
    <label>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(event) => onSelectionChange(event.target.checked)}
        data-testid={`framework-checkbox-${framework.id}`}
      />
      {framework.name}
    </label>
  ),
}));

import { AddFrameworkModal } from './AddFrameworkModal';

const mockAvailableFrameworks = [
  {
    id: 'fw-1',
    name: 'SOC 2',
    description: 'SOC 2 Type II',
    version: '1.0',
    visible: true,
  },
  {
    id: 'fw-2',
    name: 'ISO 27001',
    description: 'ISO 27001:2022',
    version: '2022',
    visible: true,
  },
];

const defaultProps = {
  onOpenChange: vi.fn(),
  availableFrameworks: mockAvailableFrameworks,
  organizationId: 'org-1',
};

describe('AddFrameworkModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddFrameworks.mockResolvedValue({ frameworksAdded: 1 });
  });

  describe('Permission gating', () => {
    it('enables the "Add Selected" button when user has framework:create permission and frameworks selected', () => {
      setMockPermissions(ADMIN_PERMISSIONS);

      render(<AddFrameworkModal {...defaultProps} />);

      const checkbox = screen.getByTestId('framework-checkbox-fw-1');
      fireEvent.click(checkbox);

      const addButton = screen.getByRole('button', { name: /add selected/i });
      expect(addButton).not.toBeDisabled();
    });

    it('disables the "Add Selected" button when user lacks framework:create permission (auditor)', () => {
      setMockPermissions(AUDITOR_PERMISSIONS);

      render(<AddFrameworkModal {...defaultProps} />);

      const checkbox = screen.getByTestId('framework-checkbox-fw-1');
      fireEvent.click(checkbox);

      const addButton = screen.getByRole('button', { name: /add selected/i });
      expect(addButton).toBeDisabled();
    });

    it('disables the "Add Selected" button when user has no permissions', () => {
      setMockPermissions(NO_PERMISSIONS);

      render(<AddFrameworkModal {...defaultProps} />);

      const checkbox = screen.getByTestId('framework-checkbox-fw-1');
      fireEvent.click(checkbox);

      const addButton = screen.getByRole('button', { name: /add selected/i });
      expect(addButton).toBeDisabled();
    });

    it('checks the correct resource and action for permission', () => {
      setMockPermissions(ADMIN_PERMISSIONS);

      render(<AddFrameworkModal {...defaultProps} />);

      expect(mockHasPermission).toHaveBeenCalledWith('framework', 'create');
    });
  });

  it('lets an organization administrator add a framework without a platform admin session', async () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    render(<AddFrameworkModal {...defaultProps} />);

    fireEvent.click(screen.getByTestId('framework-checkbox-fw-1'));
    fireEvent.click(screen.getByRole('button', { name: /add selected/i }));

    await waitFor(() => expect(mockAddFrameworks).toHaveBeenCalledWith(['fw-1']));
    await waitFor(() => expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false));
  });

  it('never submits a framework selection for a read-only user', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    render(<AddFrameworkModal {...defaultProps} />);

    fireEvent.click(screen.getByTestId('framework-checkbox-fw-1'));
    fireEvent.click(screen.getByRole('button', { name: /add selected/i }));

    expect(mockAddFrameworks).not.toHaveBeenCalled();
  });

  describe('Rendering', () => {
    it('renders modal title and description', () => {
      setMockPermissions(ADMIN_PERMISSIONS);

      render(<AddFrameworkModal {...defaultProps} />);

      expect(screen.getByText('Add Frameworks')).toBeInTheDocument();
      expect(screen.getByText(/select the compliance frameworks/i)).toBeInTheDocument();
    });

    it('renders available framework cards', () => {
      setMockPermissions(ADMIN_PERMISSIONS);

      render(<AddFrameworkModal {...defaultProps} />);

      expect(screen.getByText('SOC 2')).toBeInTheDocument();
      expect(screen.getByText('ISO 27001')).toBeInTheDocument();
    });

    it('shows empty state when no frameworks available', () => {
      setMockPermissions(ADMIN_PERMISSIONS);

      render(<AddFrameworkModal {...defaultProps} availableFrameworks={[]} />);

      expect(screen.getByText(/all available frameworks are already enabled/i)).toBeInTheDocument();
    });

    it('disables "Add Selected" button when nothing is selected even with permissions', () => {
      setMockPermissions(ADMIN_PERMISSIONS);

      render(<AddFrameworkModal {...defaultProps} />);

      const addButton = screen.getByRole('button', { name: /add selected/i });
      expect(addButton).toBeDisabled();
    });
  });
});
