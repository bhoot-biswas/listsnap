import path from "node:path";
import { expect, test } from "@playwright/test";

// The seller's main path, end to end in the browser: try the demo, snap a product, check
// the listing on Review and save it as a store draft. Every outside service is mocked.
test("a demo seller snaps a product and saves it as a store draft", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Try the demo shop" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/snap");
  // the "Upload photos" button opens this picker
  await page
    .locator('input[type="file"][multiple]')
    .setInputFiles(path.join(process.cwd(), "public/samples/saree.jpg"));
  await expect(page.getByText("1 photo ready")).toBeVisible();
  await page.getByRole("button", { name: "Make the listing" }).click();

  // the job page drives the pipeline, then offers Review
  await expect(page).toHaveURL(/\/job\/[0-9a-f-]{36}/);
  await page
    .getByRole("link", { name: /Review/ })
    .first()
    .click({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/job\/[0-9a-f-]{36}\/review/);
  await expect(page.getByRole("heading", { name: "Review listing" })).toBeVisible();

  await page.getByRole("button", { name: "Save draft to store" }).click();
  await expect(page.getByRole("heading", { name: "Draft saved" })).toBeVisible({ timeout: 30_000 });
});
