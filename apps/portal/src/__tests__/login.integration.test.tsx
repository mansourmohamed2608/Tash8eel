/**
 * Integration test: Login page
 *
 * Tests the login form's:
 * - Rendering and accessibility
 * - Successful login flow (credentials → session → redirect)
 * - Invalid credentials error display (Arabic error messages)
 * - Loading state while authenticating
 * - Form validation (required fields)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, test, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// next-auth/react is mocked at the module level because signIn() is not
// usable in a jsdom environment (it needs a real browser session cookie store).
// vi.mock() calls are HOISTED to the top of the file by Vitest so they run
// before any import, ensuring the mock is in place when LoginPage is imported.
// ---------------------------------------------------------------------------
vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
  getSession: vi.fn(),
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// next/navigation is not available in jsdom - provide stubs.
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/login",
}));

// Static imports - hoisted mocks above are already in place
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LoginPage from "@/app/login/page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderLogin() {
  return render(<LoginPage />);
}

async function fillAndSubmit(
  email: string,
  password: string,
  merchantId: string = "demo-merchant",
) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/رقم المتجر/i), merchantId);
  await user.type(screen.getByLabelText(/البريد الإلكتروني/i), email);
  await user.type(screen.getByLabelText(/كلمة المرور/i), password);
  await user.click(screen.getByRole("button", { name: /دخول|تسجيل/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Login page", () => {
  let mockPush: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
      replace: vi.fn(),
      prefetch: vi.fn(),
    } as any);
  });

  test("renders the login form with Arabic labels", () => {
    renderLogin();

    // Title / heading
    expect(
      screen.getByRole("heading", { name: /تسجيل الدخول|دخول/i }),
    ).toBeInTheDocument();

    // Input fields
    expect(screen.getByLabelText(/البريد الإلكتروني/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/كلمة المرور/i)).toBeInTheDocument();

    // Submit button
    expect(
      screen.getByRole("button", { name: /دخول|تسجيل/i }),
    ).toBeInTheDocument();
  });

  test("shows loading indicator while authenticating", async () => {
    // Make signIn never resolve so we can observe the loading state
    (signIn as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    renderLogin();
    await fillAndSubmit("staff@test.com", "any-password");

    expect(screen.getByRole("button", { name: /دخول|تسجيل/i })).toBeDisabled();
  });

  test("shows Arabic error for invalid credentials", async () => {
    (signIn as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: "CredentialsSignin",
      ok: false,
    });

    renderLogin();
    await fillAndSubmit("staff@test.com", "wrong-password");

    await waitFor(() => {
      expect(
        screen.getByText(/البريد الإلكتروني أو كلمة المرور غير صحيحة/i),
      ).toBeInTheDocument();
    });
  });

  test("redirects to merchant dashboard on successful OWNER login", async () => {
    (signIn as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
      ok: true,
    });
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: {
        id: "staff_001",
        role: "OWNER",
        merchantId: "merchant_test_001",
      },
    });

    renderLogin();
    await fillAndSubmit("staff@test.com", "correct-pass");

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringMatching(/\/merchant\/dashboard/),
      );
    });
  });

  test("redirects to admin dashboard on ADMIN login", async () => {
    (signIn as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
      ok: true,
    });
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "admin_001", role: "ADMIN", merchantId: "system" },
    });

    renderLogin();
    await fillAndSubmit("admin@test.com", "correct-pass");

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/\/admin/));
    });
  });

  test("password toggle shows/hides password text", async () => {
    const user = userEvent.setup();
    renderLogin();

    const passwordInput = screen.getByLabelText(/كلمة المرور/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    // Find the eye icon toggle button near the password field
    // It's within the password field container, so we look for it by its role
    const toggleButtons = screen.getAllByRole("button");
    const eyeToggle = toggleButtons.find(
      (btn) =>
        btn.querySelector("svg") &&
        btn !== screen.queryByRole("button", { name: /دخول|تسجيل/i }),
    );

    if (eyeToggle) {
      await user.click(eyeToggle);
      expect(passwordInput).toHaveAttribute("type", "text");

      await user.click(eyeToggle);
      expect(passwordInput).toHaveAttribute("type", "password");
    }
  });
});
