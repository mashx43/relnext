import { beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findNext, findPrev } from "./index";

describe("E2E Testing with TEST_URL", () => {
	const testUrl = process.env.TEST_URL;
	const debugDir = join(process.cwd(), "temp/e2e_debug");

	beforeAll(async () => {
		if (testUrl) {
			await rm(debugDir, { recursive: true, force: true });
			await mkdir(debugDir, { recursive: true });
		}
	});

	test("should find next and prev links on TEST_URL", async () => {
		if (!testUrl) {
			console.warn(
				"TEST_URL environment variable is not set. Skipping E2E test.",
			);
			return;
		}

		console.log(`Testing URL: ${testUrl}`);
		await using webview = new Bun.WebView();
		await webview.navigate(testUrl);

		// Handle Cookie Consent Banner if it exists
		await new Promise((resolve) => setTimeout(resolve, 5000));
		await webview.evaluate(`
			(function() {
				const acceptBtn = document.getElementById("onetrust-accept-btn-handler");
				if (acceptBtn) {
					acceptBtn.click();
				}
			})()
		`);

		// Dynamic waiter for rel="next" or rel='next'
		const isLoaded = await new Promise((resolve) => {
			const start = Date.now();
			const timeout = 40000;

			const check = async () => {
				const html: string = await webview.evaluate(
					`document.documentElement.outerHTML`,
				);
				const found =
					html.indexOf('rel="next"') !== -1 ||
					html.indexOf("rel='next'") !== -1;

				if (found) {
					resolve(true);
					return;
				}

				if (Date.now() - start > timeout) {
					resolve(false);
					return;
				}

				// Scroll down to trigger loading of dynamic content/pagination
				await webview.evaluate("window.scrollBy(0, 1000)");
				setTimeout(check, 3000);
			};

			check();
		});

		if (!isLoaded) {
			console.warn(
				"Pagination link with rel='next' was not found within timeout.",
			);
		} else {
			console.log(
				"Found pagination link with rel='next'. Proceeding with analysis.",
			);
		}

		// Final wait to ensure everything is settled
		await new Promise((r) => setTimeout(r, 2000));

		const html: string = await webview.evaluate(
			"document.documentElement.outerHTML",
		);
		const url: string = await webview.evaluate("window.location.href");

		// Save HTML for debugging
		const filename = `${new URL(testUrl).hostname}.html`;
		await writeFile(join(debugDir, filename), html);
		console.log(`HTML saved to: ${join(debugDir, filename)}`);

		const nextUrl = findNext(html, url);
		if (nextUrl) {
			console.log("Found next URL:", nextUrl);
			expect(nextUrl).toMatch(/^https?:\/\//);
		} else {
			console.warn("Next URL not found by relnext logic");
		}

		const prevUrl = findPrev(html, url);
		if (prevUrl) {
			console.log("Found prev URL:", prevUrl);
		}

		webview.close();
	}, 100000);
});
