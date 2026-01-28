// test/index.test.ts
import { beforeEach, describe, expect, jest, test } from "bun:test";
import type { FindNextOptions } from "../src/index"; // Type-only import
import {
	fetchHtml,
	findNext,
	findNextByUrl,
	findPrev,
	findPrevByUrl,
} from "../src/index";

// Mock global fetch for testing network requests
const mockFetch = jest.fn();
beforeEach(() => {
	globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
	mockFetch.mockClear();
});

describe("fetchHtml", () => {
	test("should successfully fetch HTML content", async () => {
		const mockHtml = "<html><body>Test</body></html>";
		mockFetch.mockResolvedValueOnce({
			ok: true,
			headers: new Headers({ "Content-Type": "text/html" }),
			text: async () => mockHtml,
		});

		const result = await fetchHtml("https://example.com");
		expect(result).toBe(mockHtml);
		expect(mockFetch).toHaveBeenCalledWith("https://example.com", {
			signal: expect.any(AbortSignal),
		});
	});

	test("should return null for non-HTML content", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			headers: new Headers({ "Content-Type": "application/json" }),
			text: async () => `{"data": "test"}`,
		});

		const result = await fetchHtml("https://example.com/api");
		expect(result).toBeNull();
	});

	test("should return null on fetch failure (non-2xx status)", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 404,
			statusText: "Not Found",
			headers: new Headers({ "Content-Type": "text/html" }),
		});

		const result = await fetchHtml("https://example.com/404");
		expect(result).toBeNull();
	});

	test("should return null on network error", async () => {
		mockFetch.mockRejectedValueOnce(new Error("Network Error"));

		const result = await fetchHtml("https://example.com/error");
		expect(result).toBeNull();
	});
});

describe("extractAbsoluteHref logging", () => {
	test("should call logger with a warning for an invalid href when processing HTML", () => {
		const mockLogger = jest.fn();
		const baseUrl = "https://example.com";
		// HTML with an invalid href attribute
		const htmlWithInvalidHref = `<a href="http://invalid url.com">Next</a>`; // Space makes it invalid

		// Call findNext with an options object containing our mock logger
		// and HTML that will trigger the invalid URL path in extractAbsoluteHref
		findNext(htmlWithInvalidHref, baseUrl, { logger: mockLogger });

		expect(mockLogger).toHaveBeenCalledTimes(1);
		expect(mockLogger).toHaveBeenCalledWith(
			"warn",
			expect.stringContaining(
				"Invalid URL 'http://invalid url.com' for base 'https://example.com'",
			),
		);
	});
});
describe("findNext and findPrev (HTML parsing strategies)", () => {
	const baseUrl = "https://example.com";

	describe("by 'rel' attribute", () => {
		test("should find next link with rel=next", () => {
			const html = `<head><link rel="next" href="/page/2"></head>`;
			expect(findNext(html, baseUrl)).toBe("https://example.com/page/2");
		});

		test("should find prev link with rel=prev", () => {
			const html = `<body><a href="/page/1" rel="prev">Previous</a></body>`;
			expect(findPrev(html, baseUrl)).toBe("https://example.com/page/1");
		});
	});

	describe("by 'pagination' structure", () => {
		test("should find next link in standard pagination list", () => {
			const html = `
				<div class="pagination">
					<li class="current">1</li> <li class=""><a href="/page/2">2</a></li>
				</div>`;
			expect(findNext(html, baseUrl)).toBe("https://example.com/page/2");
		});

		test("should find prev link in standard pagination list", () => {
			const html = `
				<div class="pagination">
					<li class=""><a href="/page/1">1</a></li> <li class="current">2</li>
				</div>`;
			expect(findPrev(html, baseUrl)).toBe("https://example.com/page/1");
		});

		test("should find next link in pagination fallback structure", () => {
			const html = `<div class="pagination"><span class="current">1</span> <a href="/page/2">2</a></div>`;
			expect(findNext(html, baseUrl)).toBe("https://example.com/page/2");
		});

		test("should find prev link in pagination fallback structure", () => {
			const html = `<div class="pagination"><a href="/page/1">1</a> <span class="current">2</span></div>`;
			expect(findPrev(html, baseUrl)).toBe("https://example.com/page/1");
		});
	});

	describe("by 'text' content", () => {
		test("should find next link with 'Next' text", () => {
			const html = `<footer><a href="?p=2">Next</a></footer>`;
			expect(findNext(html, baseUrl)).toBe("https://example.com/?p=2");
		});

		test("should find prev link with 'Prev' text", () => {
			const html = `<footer><a href="?p=1">Prev</a></footer>`;
			expect(findPrev(html, baseUrl)).toBe("https://example.com/?p=1");
		});

		test("should find next link with Japanese '次へ' text", () => {
			const html = `<footer><a href="?page=2">次へ</a></footer>`;
			expect(findNext(html, baseUrl)).toBe("https://example.com/?page=2");
		});

		test("should find prev link with Japanese '前へ' text", () => {
			const html = `<footer><a href="?page=1">前へ</a></footer>`;
			expect(findPrev(html, baseUrl)).toBe("https://example.com/?page=1");
		});
	});

	describe("by 'className' or 'id'", () => {
		test("should find next link with 'next' class name", () => {
			const html = `<a class="next-btn" href="/articles/2">Article</a>`;
			expect(findNext(html, baseUrl)).toBe("https://example.com/articles/2");
		});

		test("should find prev link with 'prev' class name", () => {
			const html = `<a class="prev-btn" href="/articles/1">Article</a>`;
			expect(findPrev(html, baseUrl)).toBe("https://example.com/articles/1");
		});

		test("should match custom class name with classNameRegex option", () => {
			const html = `<a class="my-custom-next" href="/c/2">Custom</a>`;
			const options: FindNextOptions = {
				methods: ["className"],
				classNameRegex: /my-custom-next/i,
			};
			expect(findNext(html, baseUrl, options)).toBe("https://example.com/c/2");
		});
	});

	describe("by 'aria-label' attribute", () => {
		test("should find next link with aria-label='Next page'", () => {
			const html = `<a href="/p/2" aria-label="Next page"></a>`;
			expect(findNext(html, baseUrl)).toBe("https://example.com/p/2");
		});

		test("should find prev link with aria-label='Previous page'", () => {
			const html = `<a href="/p/1" aria-label="Previous page"></a>`;
			expect(findPrev(html, baseUrl)).toBe("https://example.com/p/1");
		});
	});

	describe("by 'alt' text of an image", () => {
		test("should find next link with img alt text 'Next'", () => {
			const html = `<a href="/images/2"><img src="next.png" alt="Next" /></a>`;
			expect(findNext(html, baseUrl)).toBe("https://example.com/images/2");
		});

		test("should find prev link with img alt text 'Previous'", () => {
			const html = `<a href="/images/1"><img src="prev.png" alt="Previous" /></a>`;
			expect(findPrev(html, baseUrl)).toBe("https://example.com/images/1");
		});
	});

	describe("Strategy priority and options", () => {
		test("should prioritize 'rel' attribute by default", () => {
			const html = `
				<a href="/from-text">Next</a>
				<link rel="next" href="/from-rel">
				<div class="pagination"><a href="/from-pagination">2</a></div>
			`;
			expect(findNext(html, baseUrl)).toBe("https://example.com/from-rel");
		});

		test("should only use specified methods if 'methods' option is provided", () => {
			const html = `
				<a href="/from-text">Next</a>
				<link rel="next" href="/from-rel">
			`;
			// Should only find 'text' link if only 'text' method is specified
			expect(findNext(html, baseUrl, { methods: ["text"] })).toBe(
				"https://example.com/from-text",
			);
			// Should only find 'rel' link if only 'rel' method is specified
			expect(findNext(html, baseUrl, { methods: ["rel"] })).toBe(
				"https://example.com/from-rel",
			);
		});

		test("should prioritize methods based on the order in 'methods' option", () => {
			const html = `
				<a href="/from-text">Next</a>
				<link rel="next" href="/from-rel">
			`;
			expect(findNext(html, baseUrl, { methods: ["text", "rel"] })).toBe(
				"https://example.com/from-text",
			);
			expect(findNext(html, baseUrl, { methods: ["rel", "text"] })).toBe(
				"https://example.com/from-rel",
			);
		});
	});

	test("should return null if no link is found", () => {
		const html = `<body><p>No links here.</p></body>`;
		expect(findNext(html, baseUrl)).toBeNull();
		expect(findPrev(html, baseUrl)).toBeNull();
	});
});

describe("findNextByUrl and findPrevByUrl (URL pattern inference)", () => {
	// Mock urlExists for testing URL pattern inference
	beforeEach(() => {
		mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
			if (init?.method === "HEAD") {
				const urlObj = new URL(_url);

				let pageNumberStr: string | null = null;
				const pathMatch = urlObj.pathname.match(/\/(\d+)$/);
				if (pathMatch?.[1]) {
					pageNumberStr = pathMatch[1];
				} else {
					pageNumberStr = urlObj.searchParams.get("page");
				}

				let pageNumber = pageNumberStr ? parseInt(pageNumberStr, 10) : 0;
				if (Number.isNaN(pageNumber)) {
					pageNumber = 0;
				}

				return { ok: pageNumber > 0 || !pageNumber }; // Also consider no page number as existing
			}
			// For fetchHtml calls within the same test context, return dummy HTML
			return {
				ok: true,
				headers: new Headers({ "Content-Type": "text/html" }),
				text: async () => "<html></html>",
			};
		});
	});

	test("should find next page URL by query parameter", async () => {
		const url = "https://example.com/search?page=2";
		expect(await findNextByUrl(url)).toBe("https://example.com/search?page=3");
	});

	test("should find previous page URL by query parameter", async () => {
		const url = "https://example.com/search?page=2";
		expect(await findPrevByUrl(url)).toBe("https://example.com/search?page=1");
	});

	test("should find next page URL by path segment", async () => {
		const url = "https://example.com/archive/2";
		expect(await findNextByUrl(url)).toBe("https://example.com/archive/3");
	});

	test("should find previous page URL by path segment", async () => {
		const url = "https://example.com/archive/2";
		expect(await findPrevByUrl(url)).toBe("https://example.com/archive/1");
	});

	test("should return null if inferred URL does not exist", async () => {
		// Mock urlExists to return false for page=0 (e.g., trying to go prev from page 1)
		mockFetch.mockImplementationOnce(
			async (_url: string, init?: RequestInit) => {
				if (init?.method === "HEAD") {
					return { ok: false };
				}
				return {
					ok: true,
					headers: new Headers(),
					text: async () => "",
				};
			},
		);
		const url = "https://example.com/search?page=1";
		expect(await findPrevByUrl(url)).toBeNull(); // page=0 should not exist
	});

	test("should return null if no page number pattern is found", async () => {
		const url = "https://example.com/about";
		expect(await findNextByUrl(url)).toBeNull();
		expect(await findPrevByUrl(url)).toBeNull();
		// Ensure urlExists was not called for a non-page URL
		expect(mockFetch).not.toHaveBeenCalledWith(expect.any(String), {
			method: "HEAD",
		});
	});

	describe("with verifyExists: false", () => {
		test("should return inferred URL without making a HEAD request", async () => {
			const url = "https://example.com/search?page=2";
			const result = await findNextByUrl(url, { verifyExists: false });
			expect(result).toBe("https://example.com/search?page=3");
			// Verify that no HEAD request was made
			expect(mockFetch).not.toHaveBeenCalledWith(expect.any(String), {
				method: "HEAD",
				signal: expect.any(AbortSignal),
			});
		});

		test("should return inferred prev URL without making a HEAD request", async () => {
			const url = "https://example.com/search?page=2";
			const result = await findPrevByUrl(url, { verifyExists: false });
			expect(result).toBe("https://example.com/search?page=1");
			expect(mockFetch).not.toHaveBeenCalled();
		});
	});
});
