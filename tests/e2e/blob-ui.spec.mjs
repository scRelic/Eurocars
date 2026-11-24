import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL;
if (!baseUrl || !["127.0.0.1", "localhost", "::1"].includes(new URL(baseUrl).hostname)) {
  throw new Error("Blob UI tests require an isolated local test server.");
}
test.use({ ignoreHTTPSErrors: true });
test.skip(process.env.E2E_BLOB_UI !== "1", "Requires the isolated Blob UI test server.");

test("direct photo uploads retry and retain ordering; avatar uses the Blob flow", async ({ page }) => {
  test.setTimeout(90_000);
  let attempts = 0;
  const uploadedSizes = [];
  let listingBody;
  await page.route("https://vercel.com/**", (route) => route.abort());
  await page.route("https://vercel.com/api/blob/**", async (route) => {
    const request = route.request();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "PUT, OPTIONS",
      "access-control-allow-headers": "*" };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    attempts++;
    const pathname = new URL(request.url()).searchParams.get("pathname");
    uploadedSizes.push(Number(await request.headerValue("x-content-length")) || request.postDataBuffer()?.length || 0);
    if (attempts === 1) {
      await route.fulfill({ status: 400, headers, json: { error: { code: "bad_request", message: "Test failure" } } });
      return;
    }
    await route.fulfill({ status: 200, headers, json: {
      pathname, url: `https://test.private.blob.vercel-storage.com/${pathname}`,
      downloadUrl: `https://test.private.blob.vercel-storage.com/${pathname}`,
      contentType: "image/png", contentDisposition: "inline", etag: "test",
    } });
  });
  await page.route("**/api/uploads/complete", (route) => route.fulfill({ status: 200, json: { status: "READY" } }));
  await page.route("**/api/cars", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    listingBody = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { listing: { id: "1", images: [] } } });
  });
  await page.route("https://example.test/**", (route) => route.abort());

  await page.goto(`${baseUrl}/register`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("First name").fill("Blob");
  await page.getByLabel("Email address").fill(`blob-ui-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByLabel("Confirm password").fill("test-password-123");
  await page.getByRole("checkbox", { name: /I agree/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/profile$/);

  await page.goto(`${baseUrl}/sell`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("combobox", { name: "Brand" }).click();
  await page.getByRole("option", { name: "BMW", exact: true }).click();
  await page.getByRole("combobox", { name: "Model" }).click();
  await page.getByRole("option", { name: "3 Series", exact: true }).click();
  await page.getByLabel("Year *").fill("2021");
  await page.getByLabel("Listing title *").fill("Blob UI test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Mileage (km) *").fill("45000");
  await page.getByRole("button", { name: "Continue" }).click();

  const small = Buffer.from("89504e470d0a1a0a0000000d49484452000000080000000808020000004b6d29dc0000000970485973000003e8000003e801b57b526b00000011494441540899637049ebc08a1886960400d37b4c81254b16660000000049454e44ae426082", "hex");
  const large = Buffer.alloc(5 * 1024 * 1024);
  small.copy(large);
  await page.getByLabel("Choose listing photos").setInputFiles([
    { name: "large.png", mimeType: "image/png", buffer: large },
    { name: "small.png", mimeType: "image/png", buffer: small },
  ]);
  await expect(page.getByText("2 of 20 photos selected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry upload" })).toBeVisible();
  await page.getByRole("button", { name: "Retry upload" }).click();
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(2);
  await page.waitForTimeout(500);
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(2);
  expect(uploadedSizes.some((size) => size > 4.5 * 1024 * 1024)).toBe(true);
  await page.getByRole("button", { name: "Set photo 2 as main" }).click();
  await page.getByRole("button", { name: "Move photo 2 earlier" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("option", { name: "Germany", exact: true }).click();
  await page.getByLabel("City *").fill("Berlin");
  await page.getByLabel("Price *").fill("25000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page).toHaveURL(/\/account\/listings$/);
  expect(listingBody.imageOrder).toHaveLength(2);
  expect(listingBody.imageOrder[0]).toMatchObject({ kind: "prepared", isPrimary: true });
  expect(listingBody.imageOrder[1]).toMatchObject({ kind: "prepared", isPrimary: false });
  expect(listingBody.imageOrder[0].id).not.toBe(listingBody.imageOrder[1].id);

  const auth = await (await page.request.get(`${baseUrl}/api/auth/me`)).json();
  await page.route("**/api/users/me/avatar/complete", (route) => route.fulfill({
    status: 200, json: { user: { ...auth.user, avatarUrl: "https://example.test/avatar.webp" } },
  }));
  await page.goto(`${baseUrl}/account/settings`);
  await page.waitForLoadState("networkidle");
  await page.locator("input[type=file]").setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: small });
  await page.getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByText("Profile photo updated.")).toBeVisible();
});

test("responsive public variants and broken thumbnail fallback", async ({ page, browser }) => {
  const carId = process.env.E2E_BLOB_CAR_ID;
  expect(carId).toMatch(/^[1-9]\d*$/);
  const image = Buffer.from("89504e470d0a1a0a0000000d49484452000000080000000808020000004b6d29dc0000000970485973000003e8000003e801b57b526b00000011494441540899637049ebc08a1886960400d37b4c81254b16660000000049454e44ae426082", "hex");
  await page.route("https://test.public.blob.vercel-storage.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: image }));
  await page.route("**/images/no-test.png", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: image }));
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`${baseUrl}/cars/${carId}`);
  const mainPhoto = page.getByRole("button", { name: "Open full-screen photo gallery" }).locator("img");
  await expect.poll(() => mainPhoto.evaluate((img) => img.currentSrc)).toContain("/catalog.webp");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => mainPhoto.evaluate((img) => img.currentSrc)).toContain("/gallery.webp");
  const thumbnail = page.getByRole("button", { name: "View photo 1" }).filter({ visible: true }).locator("img");
  await expect.poll(() => thumbnail.evaluate((img) => img.currentSrc)).toContain("/thumbnail.webp");

  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 375, height: 900 } });
  try {
    const cardPage = await context.newPage();
    await cardPage.route("https://test.public.blob.vercel-storage.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: image }));
    await cardPage.route("https://test.public.blob.vercel-storage.com/**/thumbnail.webp", (route) => route.abort());
    await cardPage.goto(`${baseUrl}/cars`);
    const cardImage = cardPage.locator(`a[href="/cars/${carId}"]`).locator("img");
    await cardImage.scrollIntoViewIfNeeded();
    await expect.poll(() => cardImage.evaluate((img) => img.currentSrc)).toContain("/catalog.webp");
    await expect(cardImage).toBeVisible();
    await cardPage.route("https://test.public.blob.vercel-storage.com/**/catalog.webp", (route) => route.abort());
    await cardPage.goto(baseUrl);
    const hero = cardPage.locator("section").first().locator("img[fetchpriority=high]");
    await expect(hero).toHaveAttribute("loading", "eager");
    await expect.poll(() => hero.evaluate((img) => img.currentSrc)).toContain("/images/image-unavailable.svg");
  } finally {
    await context.close();
  }
});
