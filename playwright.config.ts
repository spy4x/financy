import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright Configuration for Financy E2E Tests
 *
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  // Configure output directories for test artifacts
  outputDir: "./e2e/results",

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!Deno.env.get("CI"),

  // Retry on CI only
  retries: Deno.env.get("CI") ? 2 : 0,

  // Run tests in files in parallel
  fullyParallel: false,
  workers: 1,

  // Global test timeout (30 seconds)
  timeout: 30_000,

  // Reporter to use. See https://playwright.dev/docs/test-reporters
  reporter: [
    ["html", { open: "never" }], // Generate HTML report but don't auto-open/serve
    ["list"], // Show progress in terminal
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: "http://fn.localhost",

    // Action timeout (10 seconds)
    actionTimeout: 10_000,

    // Navigation timeout (10 seconds)
    navigationTimeout: 10_000,
    // Collect trace when retrying the failed test
    // trace: "on-first-retry",

    // Take screenshot on failure
    // screenshot: "only-on-failure",

    // Record video on failure
    // video: "retain-on-failure",
  },

  // Configure projects for major browsers
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // {
    //   name: "Google Chrome",
    //   use: { ...devices["Desktop Chrome"], channel: "chrome" },
    // },
    // {
    //   name: "Mobile Safari",
    //   use: { ...devices["iPhone 12"] },
    // },
    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },
    // {
    //   name: "chromium",
    //   use: { ...devices["Desktop Chrome"] },
    // },
    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },
    // {
    //   name: "Mobile Chrome",
    //   use: { ...devices["Pixel 5"] },
    // },
    // {
    //   name: "Microsoft Edge",
    //   use: { ...devices["Desktop Edge"], channel: "msedge" },
    // },
  ],
  // Run your local dev server before starting the tests
  //   webServer: {
  //     command: "deno task dev",
  //     url: "http://fn.localhost",
  //     reuseExistingServer: !Deno.env.get("CI"),
  //     timeout: 120 * 1000, // 2 minutes to start the dev server
  //   },
})
