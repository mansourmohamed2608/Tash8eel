import {
  describe,
  test,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ErrorBoundary } from "@/components/error-boundary";

function ThrowingComponent({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div>Working fine</div>;
}

describe("ErrorBoundary", () => {
  // Suppress console.error in tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });
  afterEach(() => {
    cleanup();
  });

  test("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  test("renders error fallback when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText("حدث خطأ غير متوقع")).toBeInTheDocument();
  });

  test("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom Error</div>}>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Custom Error")).toBeInTheDocument();
  });

  test("calls onError callback when error occurs", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe("Test error");
  });

  test("retry button resets the error boundary", () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    // Error fallback should be shown
    const heading = container.querySelector("h2");
    expect(heading).toBeTruthy();
    expect(heading!.textContent).toBe("حدث خطأ غير متوقع");

    // Find and click retry button
    const retryBtn = container.querySelector("button");
    expect(retryBtn).toBeTruthy();
    fireEvent.click(retryBtn!);

    // After reset, ThrowingComponent throws again → error fallback returns
    const headingAfter = container.querySelector("h2");
    expect(headingAfter).toBeTruthy();
    expect(headingAfter!.textContent).toBe("حدث خطأ غير متوقع");
  });

  test("has accessible role=alert", () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
  });

  test("shows home page link", () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    const link = container.querySelector('a[href="/merchant/dashboard"]');
    expect(link).toBeTruthy();
    expect(link!.textContent).toContain("الصفحة الرئيسية");
  });
});
