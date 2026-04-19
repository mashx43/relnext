import { beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findNext, findPrev } from "../src/index";

describe("E2E Testing with TEST_URL", () => {
	const testUrl = process.env.TEST_URL;
	const debugDir = join(process.cwd(), "temp/e2e_debug");

	beforeAll(async () => {
		if (testUrl) {
			await rm(debugDir, { recursive: true, force: true });
			await mkdir(debugDir, { recursive: true });
		}
	});

	test("should detect and navigate using findNext", async () => {
		if (!testUrl) {
			console.warn(
				"TEST_URL environment variable is not set. Skipping E2E test.",
			);
			return;
		}

		console.log(`[E2E] Testing URL: ${testUrl}`);
		const webview = new Bun.WebView();
		try {
			await webview.navigate(testUrl);

			// Wait for initial load and handle potential overlays
			await new Promise((resolve) => setTimeout(resolve, 8000));
			await webview.evaluate(`
				(function() {
					const selectors = [
						"#onetrust-accept-btn-handler",
						".cookie-accept",
						"[aria-label='Accept cookies']",
						".accept-all"
					];
					for (const s of selectors) {
						const el = document.querySelector(s);
						if (el && typeof el.click === 'function') el.click();
					}
				})()
			`);

			// Wait for pagination to appear
			const isReady = await new Promise((resolve) => {
				const start = Date.now();
				const timeout = 45000;
				const check = async () => {
					try {
						const html: string = await webview.evaluate(
							"document.documentElement.outerHTML",
						);
						const url: string = await webview.evaluate("window.location.href");
						const result = findNext(html, url);

						if (result) {
							resolve(true);
							return;
						}
					} catch (e) {
						console.error("[E2E] Error during check:", e);
					}

					if (Date.now() - start > timeout) {
						resolve(false);
						return;
					}
					await webview.evaluate("window.scrollBy(0, 500)");
					setTimeout(check, 3000);
				};
				check();
			});

			if (!isReady) {
				console.warn("[E2E] Navigation element not detected within timeout.");
			}

			const html: string = await webview.evaluate(
				"document.documentElement.outerHTML",
			);
			const currentUrl: string = await webview.evaluate("window.location.href");

			// Save HTML for debugging
			const filename = `${new URL(testUrl).hostname}.html`;
			await writeFile(join(debugDir, filename), html);

			const result = findNext(html, currentUrl);

			if (result) {
				console.log(`[E2E] Found next navigation:`, result);

				if (result.url) {
					expect(result.url).toMatch(/^https?:\/\//);
				}

				expect(result.selector).toBeDefined();

				// Test clicking the selector
				console.log(`[E2E] Attempting to click selector: ${result.selector}`);
				await webview.evaluate(`
					(function() {
						const el = document.querySelector("${result.selector}");
						if (el) {
							el.scrollIntoView();
							el.click();
							return true;
						}
						return false;
					})()
				`);

				// Wait a bit to see if navigation happens
				await new Promise((r) => setTimeout(r, 5000));
				const newUrl: string = await webview.evaluate("window.location.href");
				console.log(`[E2E] URL after click: ${newUrl}`);
			} else {
				throw new Error("Navigation result not found");
			}

			const prevResult = findPrev(html, currentUrl);
			if (prevResult) {
				console.log(`[E2E] Found prev navigation:`, prevResult);
			}
		} finally {
			webview.close();
		}
	}, 150000);
});
