import { describe, expect, test } from "bun:test";
import {
	findNext,
	findNextSelector,
	findNextURL,
	findPrev,
} from "../src/index";

describe("HTML Detection", () => {
	const baseUrl = "https://example.com/blog";

	describe("Strategy: rel", () => {
		test("should find link by rel='next'", () => {
			const html = '<link rel="next" href="/page/2">';
			const result = findNext(html, baseUrl);
			expect(result?.url).toBe("https://example.com/page/2");
			expect(result?.method).toBe("rel");
		});

		test("should handle rel='next' without href", () => {
			const html = '<a rel="next" id="next-btn">Next</a>';
			const result = findNext(html, baseUrl);
			expect(result?.url).toBeNull();
			expect(result?.selector).toBe("#next-btn");
		});
	});

	describe("Strategy: text", () => {
		test("should find by English text", () => {
			const html = '<a href="/page/2">Next Page</a>';
			expect(findNextURL(html, baseUrl)).toBe("https://example.com/page/2");
		});

		test("should find by Japanese text", () => {
			const html = '<a href="/p2">次のページへ</a>';
			expect(findNextURL(html, baseUrl)).toBe("https://example.com/p2");
		});
	});

	describe("Strategy: pagination structure", () => {
		test("should find next to active item", () => {
			const html = `
        <nav class="pagination">
          <ul>
            <li class="current">1</li>
            <li><a href="/page/2">2</a></li>
          </ul>
        </nav>
      `;
			expect(findNextURL(html, baseUrl)).toBe("https://example.com/page/2");
		});
	});

	describe("Strategy: className", () => {
		test("should find by class name", () => {
			const html = '<a href="/p2" class="pagination-next">2</a>';
			expect(findNextURL(html, baseUrl)).toBe("https://example.com/p2");
		});
	});

	describe("Strategy: aria-label", () => {
		test("should find by aria-label", () => {
			const html = '<a href="/p2" aria-label="Next page">2</a>';
			expect(findNextURL(html, baseUrl)).toBe("https://example.com/p2");
		});
	});

	describe("Strategy: alt", () => {
		test("should find by img alt text", () => {
			const html = '<a href="/p2"><img src="next.png" alt="Next"></a>';
			expect(findNextURL(html, baseUrl)).toBe("https://example.com/p2");
		});
	});

	describe("Wrappers", () => {
		const html = '<a rel="next" href="/p2" id="n">Next</a>';

		test("findNextURL should return string", () => {
			expect(findNextURL(html, baseUrl)).toBe("https://example.com/p2");
		});

		test("findNextSelector should return string", () => {
			expect(findNextSelector(html)).toBe("#n");
		});
	});
});

describe("findPrev", () => {
	const baseUrl = "https://example.com/blog";

	test("should find previous page link", () => {
		const html = '<link rel="prev" href="/page/1">';
		const result = findPrev(html, baseUrl);
		expect(result?.url).toBe("https://example.com/page/1");
	});
});
