import { describe, expect, test } from "bun:test";
import { findNextByUrl, findPrevByUrl } from "../src/index";

describe("URL Pattern Inference", () => {
	const options = { verifyExists: false };

	describe("Query Parameters", () => {
		test("should infer next page by page=1", async () => {
			expect(await findNextByUrl("https://example.com/?page=1", options)).toBe(
				"https://example.com/?page=2",
			);
		});

		test("should infer next page by p=5", async () => {
			expect(await findNextByUrl("https://example.com/?p=5", options)).toBe(
				"https://example.com/?p=6",
			);
		});

		test("should infer prev page by page=2", async () => {
			expect(await findPrevByUrl("https://example.com/?page=2", options)).toBe(
				"https://example.com/?page=1",
			);
		});
	});

	describe("Path Segments", () => {
		test("should infer next page by articles/page/1", async () => {
			expect(
				await findNextByUrl("https://example.com/articles/page/1", options),
			).toBe("https://example.com/articles/page/2");
		});

		test("should infer next page by p/10", async () => {
			expect(await findNextByUrl("https://example.com/p/10", options)).toBe(
				"https://example.com/p/11",
			);
		});
	});

	describe("No Match", () => {
		test("should return null if no pattern found", async () => {
			expect(
				await findNextByUrl("https://example.com/about", options),
			).toBeNull();
		});
	});
});
