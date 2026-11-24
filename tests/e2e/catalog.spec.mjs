import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.E2E_BASE_URL;
if (!baseUrl || !["127.0.0.1", "localhost", "::1"].includes(new URL(baseUrl).hostname)) {
  throw new Error("Set E2E_BASE_URL to an isolated local test server.");
}
test.use({ ignoreHTTPSErrors: true });

const openInteractivePage = async (page, url) => {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
};

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 667 }]) {
  test(`home price search accepts exact amounts and rejects reversed ranges (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openInteractivePage(page, baseUrl);
    await page.getByLabel("Price from, €").fill("20000");
    await page.getByLabel("Price to, €").fill("12500.50");
    await page.getByRole("button", { name: "Search Cars" }).click();
    await expect(page.getByRole("alert")).toHaveText("Minimum price cannot exceed maximum price.");
    await expect(page).toHaveURL(`${baseUrl}/`);

    await page.getByLabel("Price from, €").fill("12000");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Search Cars" }).click();
    await expect(page).toHaveURL(/\/cars\?minPrice=12000&maxPrice=12500\.5$/);
    await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
  });

  test(`catalog rejects reversed prices and accepts exact bounds (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openInteractivePage(page, `${baseUrl}/cars`);
    if (viewport.width < 1024) await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByLabel("Price from, €").fill("20000");
    await page.getByLabel("Price to, €").fill("12500");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("alert")).toHaveText("Minimum price cannot exceed maximum price.");
    await expect(page).toHaveURL(`${baseUrl}/cars`);

    await page.getByLabel("Price from, €").fill("12500");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/\/cars\?minPrice=12500&maxPrice=12500$/);
    await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
  });

  for (const path of ["/", "/cars", "/login", "/register", "/forgot-password"]) {
    test(`public page ${path} has no detected WCAG A/AA violations (${viewport.width}px)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`${baseUrl}${path}`);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

test("home brand and model search opens the matching catalog", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInteractivePage(page, baseUrl);
  await page.getByRole("combobox", { name: "Brand" }).click();
  const modelsResponse = page.waitForResponse((response) =>
    /\/api\/brands\/\d+\/models$/.test(response.url()) && response.status() === 200,
  );
  await page.getByRole("option", { name: "BMW", exact: true }).click();
  await modelsResponse;
  await expect(page.getByRole("combobox", { name: "Model" })).toBeEnabled();
  await page.getByRole("combobox", { name: "Model" }).click();
  await page.getByRole("option", { name: "3 Series", exact: true }).click();
  await page.getByRole("button", { name: "Search Cars" }).click();
  await expect(page).toHaveURL(/\/cars\?brand=BMW&model=3\+Series$/);
  await expect(page.getByRole("button", { name: "Remove BMW filter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove 3 Series filter" })).toBeVisible();
  await page.getByRole("button", { name: "Remove BMW filter" }).click();
  await expect(page).toHaveURL(`${baseUrl}/cars`);
  await expect(page.getByRole("button", { name: "Remove 3 Series filter" })).toHaveCount(0);
});

test("clearing selected catalog filters removes their query parameters", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInteractivePage(page, `${baseUrl}/cars?brand=BMW&model=3+Series&sort=price-asc`);
  await page.getByRole("combobox", { name: "Brand" }).click();
  await page.getByRole("option", { name: "Any brand" }).click();
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(`${baseUrl}/cars?sort=price-asc`);
});

test("brand selector supports keyboard selection and Escape", async ({ page }) => {
  await openInteractivePage(page, baseUrl);
  const brand = page.getByRole("combobox", { name: "Brand" });
  await brand.focus();
  await brand.press("ArrowDown");
  await expect(brand).toHaveAttribute("aria-expanded", "true");
  await brand.press("ArrowDown");
  const activeId = await brand.getAttribute("aria-activedescendant");
  expect(activeId).toBeTruthy();
  const selectedLabel = await page.locator(`[id="${activeId}"]`).textContent();
  expect(selectedLabel?.trim()).toBeTruthy();
  await brand.press("Enter");
  await expect(brand).toContainText(selectedLabel.trim());
  await expect(brand).toBeFocused();
  await expect(brand).toHaveAttribute("aria-expanded", "false");
  await brand.press("ArrowDown");
  await brand.press("Escape");
  await expect(brand).toHaveAttribute("aria-expanded", "false");
  await expect(brand).toBeFocused();
});

test("home and catalog fit the viewport at common screen sizes", async ({ page }) => {
  test.setTimeout(60_000);
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932], [768, 1024],
                                  [1024, 768], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width, height });
    for (const [path, title] of [["/", "Find Your Next Car in Europe"], ["/cars", "Cars across Europe"]]) {
      await page.goto(`${baseUrl}${path}`);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(dimensions.document, `${path} at ${width}×${height}`).toBeLessThanOrEqual(dimensions.viewport);
    }
  }
});

test("listing titles containing HTML are rendered as text", async ({ page }) => {
  await openInteractivePage(page, `${baseUrl}/cars?brand=Audi`);
  await page.getByRole("link", { name: /Audi A4/ }).first().click();
  await expect(page.getByText('<img src=x onerror="window.__eurocars_xss=1">', { exact: true })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__eurocars_xss ?? null)).toBeNull();
  await expect(page.getByText("No photos available")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open full-screen photo gallery" })).toHaveCount(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Sign in to save cars.");
  await page.getByRole("button", { name: "Contact seller" }).first().click();
  await expect(page).toHaveURL(/\/login\?redirect=/);
});

test("registered buyer can save cars, sign out and sign back in", async ({ page }) => {
  test.skip(process.env.E2E_ALLOW_MUTATIONS !== "1", "Requires a disposable test database.");
  await page.setViewportSize({ width: 1440, height: 900 });
  const email = `browser-${Date.now()}@example.test`;
  await openInteractivePage(page, `${baseUrl}/register`);
  await page.getByLabel("First name").fill("Browser");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByLabel("Confirm password").fill("test-password-123");
  await page.getByRole("checkbox", { name: /I agree/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "Welcome back, Browser!" })).toBeVisible();

  await openInteractivePage(page, `${baseUrl}/cars?brand=Audi`);
  await page.getByRole("button", { name: "Save Audi A4 to favorites" }).click();
  await expect(page.getByRole("button", { name: "Remove Audi A4 from favorites" })).toBeVisible();
  await openInteractivePage(page, `${baseUrl}/account/favorites`);
  await expect(page.getByRole("heading", { name: "Audi A4" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Audi A4 from favorites" }).click();
  await expect(page.getByRole("heading", { name: "Audi A4" })).toHaveCount(0);
  await page.locator("aside").getByRole("button", { name: "Sign Out" }).click();
  await expect(page).toHaveURL(`${baseUrl}/`);
  await openInteractivePage(page, `${baseUrl}/profile`);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "Welcome back, Browser!" })).toBeVisible();
});

test("seller creates a draft, resubmits after rejection, and an admin approves it", async ({ page, browser }) => {
  test.skip(process.env.E2E_ALLOW_MUTATIONS !== "1", "Requires a disposable test database.");
  test.setTimeout(90_000);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = `Browser seller ${suffix}`;
  const editedTitle = `${title} edited`;
  const correctedTitle = `${editedTitle} corrected`;
  await openInteractivePage(page, `${baseUrl}/register`);
  await page.getByLabel("First name").fill("Seller");
  await page.getByLabel("Email address").fill(`seller-${suffix}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByLabel("Confirm password").fill("test-password-123");
  await page.getByRole("checkbox", { name: /I agree/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/profile$/);

  expect((await page.request.get(`${baseUrl}/api/admin/access`)).status()).toBe(403);
  await openInteractivePage(page, `${baseUrl}/admin`);
  await expect(page).toHaveURL(`${baseUrl}/`);
  const guestContext = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const guest = await guestContext.newPage();
    await openInteractivePage(guest, `${baseUrl}/admin`);
    await expect(guest).toHaveURL(/\/login\?redirect=/);
    expect((await guest.request.get(`${baseUrl}/api/admin/access`)).status()).toBe(401);
  } finally {
    await guestContext.close();
  }

  await openInteractivePage(page, `${baseUrl}/sell`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Please check the highlighted fields before continuing.")).toBeVisible();
  await page.getByRole("combobox", { name: "Brand" }).click();
  await page.getByRole("option", { name: "BMW", exact: true }).click();
  await page.getByRole("combobox", { name: "Model" }).click();
  await page.getByRole("option", { name: "3 Series", exact: true }).click();
  await page.getByRole("combobox", { name: "Brand" }).click();
  await page.getByRole("option", { name: "Audi", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Model" })).not.toContainText("3 Series");
  await page.getByRole("combobox", { name: "Model" }).click();
  await page.getByRole("option", { name: "A4", exact: true }).click();
  await page.getByRole("combobox", { name: "Brand" }).click();
  await page.getByRole("option", { name: "BMW", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Model" })).not.toContainText("A4");
  await page.getByRole("combobox", { name: "Model" }).click();
  await page.getByRole("option", { name: "3 Series", exact: true }).click();
  await page.getByLabel("Trim", { exact: true }).fill("Sport");
  await page.getByRole("combobox", { name: "Condition" }).click();
  await page.getByRole("option", { name: "New", exact: true }).click();
  await page.getByRole("combobox", { name: "Body type" }).click();
  await page.getByRole("option", { name: "SUV", exact: true }).click();
  await page.getByLabel("Year *").fill("2021");
  await page.getByLabel("Listing title *").fill(title);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Mileage (km) *").fill("45000");
  await page.getByRole("combobox", { name: "Fuel type" }).click();
  await page.getByRole("option", { name: "Diesel", exact: true }).click();
  await page.getByRole("combobox", { name: "Transmission" }).click();
  await page.getByRole("option", { name: "Automatic", exact: true }).click();
  await page.getByLabel("Engine capacity (cc)").fill("2000");
  await page.getByLabel("Power (hp)").fill("180");
  await page.getByLabel("Exterior color").fill("Blue");
  await page.getByLabel("Interior color").fill("Black");
  await page.getByLabel("Doors", { exact: true }).fill("4");
  await page.getByLabel("Seats", { exact: true }).fill("5");
  await page.getByLabel("First registration").fill("2021-06-15");
  await page.getByText("Heated seats", { exact: true }).click();
  await expect(page.getByLabel("Heated seats")).toBeChecked();
  await page.getByText("Navigation", { exact: true }).click();
  await page.getByText("Navigation", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Navigation" })).not.toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  const image = Buffer.from("89504e470d0a1a0a0000000d49484452000000080000000808020000004b6d29dc0000000970485973000003e8000003e801b57b526b00000011494441540899637049ebc08a1886960400d37b4c81254b16660000000049454e44ae426082", "hex");
  await page.getByLabel("Choose listing photos").setInputFiles([
    { name: "car-1.png", mimeType: "image/png", buffer: image },
    { name: "car-2.png", mimeType: "image/png", buffer: image },
  ]);
  await expect(page.getByText("2 of 10 photos selected")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("option", { name: "Germany", exact: true }).click();
  await page.getByLabel("City *").fill("Berlin");
  await page.getByLabel("Postal code").fill("10115");
  await page.getByLabel("Price *").fill("25000");
  await page.getByRole("combobox", { name: "Currency" }).click();
  await page.getByRole("option", { name: "GBP", exact: true }).click();
  await page.getByLabel("Description").fill("Carefully maintained.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review your listing" })).toBeVisible();
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page).toHaveURL(/\/account\/listings$/);
  let listing = page.locator("article").filter({ has: page.getByRole("heading", { name: title }) });
  await expect(listing.getByText("draft", { exact: true })).toBeVisible();
  const editUrl = await listing.getByRole("link", { name: "Edit" }).getAttribute("href");
  expect(editUrl).toMatch(/^\/account\/listing-edit\/\d+$/);
  const listingId = editUrl.split("/").pop();
  const savedResponse = await page.request.get(`${baseUrl}/api/users/me/cars/${listingId}`);
  expect(savedResponse.status()).toBe(200);
  const savedListing = (await savedResponse.json()).listing;
  expect(savedListing).toMatchObject({
    title, trim: "Sport", condition: "NEW", bodyType: "SUV", year: 2021,
    mileage: 45000, fuelType: "DIESEL", transmission: "AUTOMATIC",
    engineCapacityCc: 2000, powerHp: 180, exteriorColor: "Blue",
    interiorColor: "Black", doors: 4, seats: 5, firstRegistration: "2021-06-15",
    countryCode: "DE", city: "Berlin", postalCode: "10115", price: 25000,
    currency: "GBP", description: "Carefully maintained.", featureIds: ["1"],
  });
  await listing.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/account\/listing-edit\//);
  await page.getByLabel("Listing title *").fill(editedTitle);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("img", { name: "Listing photo 1" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(/\/account\/listings$/);
  listing = page.locator("article").filter({ has: page.getByRole("heading", { name: editedTitle }) });
  await expect(listing.getByText("pending", { exact: true })).toBeVisible();

  const adminContext = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const admin = await adminContext.newPage();
    await openInteractivePage(admin, `${baseUrl}/login`);
    await admin.getByLabel("Email address").fill("admin@example.test");
    await admin.getByLabel("Password", { exact: true }).fill("test-password-123");
    await admin.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(admin).toHaveURL(/\/profile$/);
    await openInteractivePage(admin, `${baseUrl}/admin/moderation`);
    let pending = admin.locator("article").filter({ hasText: editedTitle });
    await expect(pending).toBeVisible();
    await pending.getByRole("button", { name: "Reject", exact: true }).click();
    await pending.getByPlaceholder("Explain what needs to be corrected.").fill("Please clarify the condition.");
    await pending.getByRole("button", { name: "Confirm rejection" }).click();
    await expect(pending).toHaveCount(0);

    await openInteractivePage(page, `${baseUrl}/account/notifications`);
    await expect(page.getByRole("button", { name: /Your listing was rejected/ })).toContainText("Please clarify the condition.");
    await openInteractivePage(page, `${baseUrl}/account/listings`);
    listing = page.locator("article").filter({ has: page.getByRole("heading", { name: editedTitle }) });
    await expect(listing.getByText("rejected", { exact: true })).toBeVisible();
    await listing.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Listing title *").fill(correctedTitle);
    for (let step = 0; step < 4; step++) {
      await page.getByRole("button", { name: "Continue" }).click();
    }
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page).toHaveURL(/\/account\/listings$/);
    listing = page.locator("article").filter({ has: page.getByRole("heading", { name: correctedTitle }) });
    await expect(listing.getByText("pending", { exact: true })).toBeVisible();

    await openInteractivePage(admin, `${baseUrl}/admin/moderation`);
    pending = admin.locator("article").filter({ hasText: correctedTitle });
    await expect(pending).toBeVisible();
    await pending.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(pending).toHaveCount(0);
    await openInteractivePage(admin, `${baseUrl}/admin/audit-logs`);
    const auditRows = admin.getByRole("row").filter({ hasText: `car #${listingId}` });
    await expect(auditRows.filter({ hasText: "listing approved" })).toHaveCount(1);
    await expect(auditRows.filter({ hasText: "listing rejected" })).toHaveCount(1);
  } finally {
    await adminContext.close();
  }
  await openInteractivePage(page, `${baseUrl}/account/listings`);
  listing = page.locator("article").filter({ has: page.getByRole("heading", { name: correctedTitle }) });
  await expect(listing.getByText("active", { exact: true })).toBeVisible();
  const publicUrl = await listing.getByRole("link", { name: "View listing" }).getAttribute("href");
  expect(publicUrl).toMatch(/^\/cars\/\d+$/);
  const publicPage = await page.context().newPage();
  await openInteractivePage(publicPage, `${baseUrl}${publicUrl}`);
  await expect(publicPage.getByText(correctedTitle, { exact: true })).toBeVisible();
  await expect(publicPage.getByRole("heading", { name: "Vehicle overview" })).toBeVisible();
  await expect(publicPage.getByText("Carefully maintained.")).toBeVisible();
  await expect(publicPage.getByText("Heated seats")).toBeVisible();
  await expect(publicPage.getByText("£25,000", { exact: true })).toBeVisible();
  await expect(publicPage.getByText("Private Seller")).toBeVisible();
  await expect(publicPage.getByRole("button", { name: "Your listing" })).toHaveCount(2);
  for (const width of [1440, 375]) {
    await publicPage.setViewportSize({ width, height: 900 });
    const gallery = publicPage.getByRole("region", { name: "Car photos" });
    const secondPhoto = gallery.getByRole("button", { name: "View photo 2" }).filter({ visible: true });
    await secondPhoto.click();
    await expect(secondPhoto).toHaveAttribute("aria-pressed", "true");
    const opener = gallery.getByRole("button", { name: "Open full-screen photo gallery" });
    await opener.focus();
    await opener.press("Enter");
    const dialog = publicPage.getByRole("dialog", { name: "Full-screen car photo gallery" });
    const close = dialog.getByRole("button", { name: "Close photo gallery" });
    await expect(close).toBeFocused();
    const photo = dialog.getByRole("img", { name: "BMW 3 Series — photo 2" });
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
    await publicPage.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Next photo" })).toBeFocused();
    await publicPage.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await publicPage.keyboard.press("ArrowRight");
    await expect(dialog.getByRole("img", { name: "BMW 3 Series — photo 1" })).toBeVisible();
    await dialog.getByRole("button", { name: "Previous photo" }).click();
    await expect(dialog.getByRole("img", { name: "BMW 3 Series — photo 2" })).toBeVisible();
    await publicPage.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
  await publicPage.close();
  await listing.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(listing.getByText("active", { exact: true })).toBeVisible();
  await listing.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive listing" }).click();
  await expect(listing.getByText("archived", { exact: true })).toBeVisible();
  const response = await page.request.get(`${baseUrl}/api${publicUrl}`);
  expect(response.status()).toBe(404);
});

test("account, seller and admin pages have no detected WCAG A/AA violations", async ({ page, browser }) => {
  test.skip(process.env.E2E_ALLOW_MUTATIONS !== "1", "Requires a disposable test database.");
  test.setTimeout(120_000);
  const login = async (target, email) => {
    await openInteractivePage(target, `${baseUrl}/login`);
    await target.getByLabel("Email address").fill(email);
    await target.getByLabel("Password", { exact: true }).fill("test-password-123");
    await target.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(target).toHaveURL(/\/profile$/);
  };
  const violations = [];
  const audit = async (target, path, viewport) => {
    await target.setViewportSize(viewport);
    await openInteractivePage(target, `${baseUrl}${path}`);
    if (path === "/sell") {
      await expect(target.getByRole("navigation", { name: "Listing progress" })
        .getByRole("button", { name: "Step 1 Vehicle details" })).toBeVisible();
    }
    const results = await new AxeBuilder({ page: target })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    for (const violation of results.violations) {
      violations.push({
        path, width: viewport.width, rule: violation.id,
        nodes: violation.nodes.map((node) => ({ html: node.html, summary: node.failureSummary })),
      });
    }
  };
  const viewports = [{ width: 375, height: 667 }, { width: 1440, height: 900 }];
  await login(page, "owner@example.test");
  for (const viewport of viewports) {
    for (const path of ["/profile", "/account/listings", "/account/favorites", "/account/messages",
                        "/account/notifications", "/account/settings", "/account/security", "/sell"]) {
      await audit(page, path, viewport);
    }
  }
  const adminContext = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const admin = await adminContext.newPage();
    await login(admin, "admin@example.test");
    for (const viewport of viewports) {
      for (const path of ["/admin", "/admin/cars", "/admin/moderation", "/admin/users",
                          "/admin/dealers", "/admin/audit-logs", "/admin/settings"]) {
        await audit(admin, path, viewport);
      }
    }
  } finally {
    await adminContext.close();
  }
  expect(violations).toEqual([]);
});
