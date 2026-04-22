import { render, screen } from "@testing-library/react";
import { test, expect } from "vitest";

function SmokeComponent() {
  return <div>Smoke Test</div>;
}

test("renders smoke component", () => {
  render(<SmokeComponent />);
  expect(screen.getByText("Smoke Test")).toBeInTheDocument();
});
