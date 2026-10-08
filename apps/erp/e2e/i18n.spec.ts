import { expect, test, type Page } from "@playwright/test";
import { open, setLanguageCookie, shot, signIn } from "./helpers";

// Signed in as the principal (principal.setup.ts). The browser picks the language with the
// language menu's cookie; the account's preferredLanguage applies when none was picked.
test.describe.configure({ mode: "serial" });

const PAGES = [
  "/",
  "/classes",
  "/calendar",
  "/attendance",
  "/homework",
  "/results",
  "/messages",
  "/boards",
  "/fees",
  "/library",
  "/department",
  "/settings",
  "/timetable",
];

const HEADINGS = {
  hi: {
    "/": "वापसी पर स्वागत है, Dr. Meera", // the dashboard greets the principal by name
    "/calendar": "कैलेंडर",
    "/settings": "सेटिंग्स",
    "/fees": "फ़ीस",
  },
  kn: {
    "/": "ಮರಳಿ ಸ್ವಾಗತ, Dr. Meera",
    "/calendar": "ಕ್ಯಾಲೆಂಡರ್",
    "/settings": "ಸೆಟ್ಟಿಂಗ್‌ಗಳು",
    "/fees": "ಶುಲ್ಕ",
  },
} as const;

/** The page fits the window: nothing scrolls sideways (wide tables scroll inside their own frame). */
async function expectNoHorizontalOverflow(page: Page, label: string) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(
    scroll,
    `${label}: page is ${scroll}px wide in a ${client}px window`,
  ).toBeLessThanOrEqual(client);
}

for (const lang of ["hi", "kn"] as const) {
  test(`${lang === "hi" ? "Hindi" : "Kannada"}: pages are translated and fit at 1280 and 1440 px`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await setLanguageCookie(page, lang);
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of PAGES) {
        await open(page, path);
        await expect(page.locator("html")).toHaveAttribute(
          "lang",
          `${lang}-IN`,
        );
        const heading = (HEADINGS[lang] as Record<string, string>)[path];
        if (heading)
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(
            heading,
          );
        await expect(page.getByTestId("error-state")).toHaveCount(0);
        await expectNoHorizontalOverflow(page, `${lang} ${path} at ${width}`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of [
      "/",
      "/calendar?month=2026-10",
      "/settings",
      "/department",
    ]) {
      await open(page, path);
      await shot(
        page,
        `${lang}-${path.replace(/[/?=]+/g, "-").replace(/^-|-$/g, "") || "today"}`,
      );
    }
  });
}

const PLAN_TEXT = {
  hi: { yearPlan: "वार्षिक योजना", lessons: "पाठ योजनाएँ", steps: "चरण", next: "अगला सप्ताह" },
  kn: { yearPlan: "ವಾರ್ಷಿಕ ಯೋಜನೆ", lessons: "ಪಾಠ ಯೋಜನೆಗಳು", steps: "ಹಂತಗಳು", next: "ಮುಂದಿನ ವಾರ" },
} as const;

for (const lang of ["hi", "kn"] as const) {
  test(`${lang === "hi" ? "Hindi" : "Kannada"}: the class plan page is translated and fits at 1280 and 1440 px`, async ({
    page,
  }) => {
    const words = PLAN_TEXT[lang];
    await setLanguageCookie(page, lang);
    await open(page, "/department");
    await page
      .getByTestId("dept-classes")
      .getByTestId("dept-class-row")
      .filter({ hasText: "Corporate Accounting" })
      .getByTestId("plan-status")
      .click();
    await expect(page).toHaveURL(/\/department\/plan\?/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "BCom Sem 3 A · Corporate Accounting",
    );
    await expect(page.getByRole("heading", { level: 2, name: words.yearPlan })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: words.lessons })).toBeVisible();
    // The seeded lesson plan is for the next Corporate Accounting period: this week or next.
    if ((await page.getByTestId("lesson-plan").count()) === 0)
      await page.getByTestId("week-nav").getByRole("link", { name: words.next }).click();
    await expect(page.getByTestId("lesson-plan")).toHaveCount(1);
    await expect(page.getByTestId("lesson-plan")).toContainText(words.steps);
    await expect(page.locator("html")).toHaveAttribute("lang", `${lang}-IN`);
    await expect(page.getByTestId("error-state")).toHaveCount(0);
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page, `${lang} class plan at ${width}`);
    }
    await shot(page, `${lang}-department-plan`);
  });
}

test("dates and money use the language with Western digits and Indian grouping", async ({
  page,
}) => {
  await setLanguageCookie(page, "hi");
  await open(page, "/calendar?month=2026-10");
  await expect(page.getByTestId("calendar-month")).toHaveText("अक्टूबर 2026");
  await expect(page.getByTestId("calendar-list")).toContainText(
    "शुक्र, 2 अक्टू॰",
  );
  await setLanguageCookie(page, "kn");
  await open(page, "/fees");
  await expect(page.getByTestId("fee-billed")).toContainText(
    /₹\d{1,2},\d{2},\d{3}/,
  );
  await expect(page.getByTestId("fee-billed")).toContainText("ಲಕ್ಷ");
});

test("the language menu switches the ERP and saves it to the account", async ({
  page,
}) => {
  await setLanguageCookie(page, "en");
  await open(page, "/");
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByTestId("language-kn").click();
  const nav = page.getByRole("navigation", { name: "ಮುಖ್ಯ" });
  await expect(nav.getByRole("link", { name: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ಮರಳಿ ಸ್ವಾಗತ");
  // Back to English (the account's preferredLanguage too).
  await page.getByRole("button", { name: "ಖಾತೆ" }).click();
  await page.getByTestId("language-en").click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");
});

test.describe("the account language applies when the browser has not picked one", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("Ravi's ERP is in Kannada (his preferredLanguage)", async ({ page }) => {
    await signIn(page, "ravi@demo.kinetix.in", undefined, undefined, null);
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/department");
    const nav = page.getByRole("navigation", { name: "ಮುಖ್ಯ" });
    await expect(
      nav.getByRole("link", { name: "ವಿಭಾಗ", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("dept-subtitle")).toContainText(
      "ಮುಖ್ಯಸ್ಥರು: Ravi Kumar",
    );
    await expect(page.getByTestId("dept-classes")).toContainText("ಪಠ್ಯಕ್ರಮ");
    await expectNoHorizontalOverflow(page, "kn /department");
  });
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("the sign-in page offers the three languages", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("login-language-hi").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("साइन इन");
    await expect(page.getByLabel("संस्थान कोड")).toBeVisible();
    await page.getByTestId("login-language-en").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  });
});
