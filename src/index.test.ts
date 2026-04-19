import { describe, expect, test } from "bun:test";
import { findNext, findNextByUrl, findPrev, findPrevByUrl } from "./index";

describe("findNext", () => {
	const baseUrl = "https://example.com/blog";

	test("should find link by rel='next'", () => {
		const html = '<link rel="next" href="/page/2">';
		expect(findNext(html, baseUrl)).toBe("https://example.com/page/2");

		const htmlA = '<a rel="next" href="https://other.com/next">Next</a>';
		expect(findNext(htmlA, baseUrl)).toBe("https://other.com/next");
	});

	test("should find link by text match (English)", () => {
		const html = '<a href="/page/2">Next Page</a>';
		expect(findNext(html, baseUrl)).toBe("https://example.com/page/2");

		const htmlOlder = '<a href="/archive/older">Older posts</a>';
		expect(findNext(htmlOlder, baseUrl)).toBe(
			"https://example.com/archive/older",
		);
	});

	test("should find link by text match (Japanese)", () => {
		const html = '<a href="/p2">次のページへ</a>';
		expect(findNext(html, baseUrl)).toBe("https://example.com/p2");

		const htmlShort = '<a href="/p2">次へ</a>';
		expect(findNext(htmlShort, baseUrl)).toBe("https://example.com/p2");
	});

	test("should find link by text match (Chinese/KW)", () => {
		const htmlCN = '<a href="/p2">下一页</a>';
		expect(findNext(htmlCN, baseUrl)).toBe("https://example.com/p2");

		const htmlKR = '<a href="/p2">다음</a>';
		expect(findNext(htmlKR, baseUrl)).toBe("https://example.com/p2");
	});

	test("should find link by aria-label", () => {
		const html = '<a href="/p2" aria-label="Next page">2</a>';
		expect(findNext(html, baseUrl)).toBe("https://example.com/p2");
	});

	test("should find link by className", () => {
		const html = '<a href="/p2" class="pagination-next">2</a>';
		expect(findNext(html, baseUrl)).toBe("https://example.com/p2");
	});

	test("should find link by pagination structure", () => {
		const html = `
      <nav class="pagination">
        <ul>
          <li class="current">1</li>
          <li><a href="/page/2">2</a></li>
        </ul>
      </nav>
    `;
		expect(findNext(html, baseUrl)).toBe("https://example.com/page/2");
	});

	test("should find link by img alt text", () => {
		const html = '<a href="/p2"><img src="next.png" alt="Next"></a>';
		expect(findNext(html, baseUrl)).toBe("https://example.com/p2");
	});
});

describe("findPrev", () => {
	const baseUrl = "https://example.com/blog";

	test("should find link by rel='prev'", () => {
		const html = '<link rel="prev" href="/page/1">';
		expect(findPrev(html, baseUrl)).toBe("https://example.com/page/1");
	});

	test("should find link by text match", () => {
		const html = '<a href="/page/1">Previous</a>';
		expect(findPrev(html, baseUrl)).toBe("https://example.com/page/1");

		const htmlJP = '<a href="/p1">前へ</a>';
		expect(findPrev(htmlJP, baseUrl)).toBe("https://example.com/p1");
	});

	test("should find link by pagination structure", () => {
		const html = `
      <div class="pager">
        <a href="/page/1">1</a>
        <span class="current">2</span>
      </div>
    `;
		expect(findPrev(html, baseUrl)).toBe("https://example.com/page/1");
	});
});

describe("findNextByUrl / findPrevByUrl", () => {
	const options = { verifyExists: false };

	test("should infer next page by query param", async () => {
		expect(await findNextByUrl("https://example.com/?page=1", options)).toBe(
			"https://example.com/?page=2",
		);
		expect(await findNextByUrl("https://example.com/?p=5", options)).toBe(
			"https://example.com/?p=6",
		);
	});

	test("should infer prev page by query param", async () => {
		expect(await findPrevByUrl("https://example.com/?page=2", options)).toBe(
			"https://example.com/?page=1",
		);
	});

	test("should infer next page by path segment", async () => {
		expect(
			await findNextByUrl("https://example.com/articles/page/1", options),
		).toBe("https://example.com/articles/page/2");
		expect(await findNextByUrl("https://example.com/p/10", options)).toBe(
			"https://example.com/p/11",
		);
	});

	test("should return null if no pattern found", async () => {
		expect(
			await findNextByUrl("https://example.com/about", options),
		).toBeNull();
	});
});
