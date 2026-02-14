import { GoalsTestForm } from "../components/GoalsTestForm.tsx";

/**
 * Test page for Goals storage testing.
 * This page is for development/testing only and should be removed
 * before the final implementation is deployed.
 *
 * Usage: Add this route temporarily during development:
 * <Route path="/test/goals" element={<GoalsTestPage />} />
 */
export function GoalsTestPage() {
  return (
    <div>
      <GoalsTestForm />
    </div>
  );
}
