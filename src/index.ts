import { REGEX } from "./constants";
import { findInternal, findResultInternal } from "./core";
import type {
	BaseOptions,
	Direction,
	FindNextOptions,
	NavigationResult,
} from "./types";
import { extractAbsoluteHref, generateSelector, urlExists } from "./utils";

export * from "./types";
export { fetchHtml } from "./utils";

/**
 * Finds next or previous page link as an object containing URL and selector.
 * Picks the first matching element regardless of whether it has an href.
 *
 * @param html - HTML string to parse.
 * @param baseUrl - Base URL for resolving absolute paths.
 * @param direction - Direction to search ("next" or "prev").
 * @param options - Configuration options for the search.
 */
function find(
	html: string,
	baseUrl: string,
	direction: Direction,
	options?: FindNextOptions,
): NavigationResult | null {
	return findResultInternal(html, baseUrl, direction, options);
}

/**
 * Finds next or previous page link URL from HTML.
 * Searches for the first element that provides a valid URL.
 *
 * @param html - HTML string to parse.
 * @param baseUrl - Base URL for resolving absolute paths.
 * @param direction - Direction to search ("next" or "prev").
 * @param options - Configuration options for the search.
 */
function findURL(
	html: string,
	baseUrl: string,
	direction: Direction,
	options?: FindNextOptions,
): string | null {
	return findInternal(html, direction, options, (match) =>
		extractAbsoluteHref(match.attributes, baseUrl, options),
	);
}

/**
 * Finds next or previous page CSS selector from HTML.
 * Searches for the first element that can be identified by a selector.
 *
 * @param html - HTML string to parse.
 * @param direction - Direction to search ("next" or "prev").
 * @param options - Configuration options for the search.
 */
function findSelector(
	html: string,
	direction: Direction,
	options?: FindNextOptions,
): string | null {
	return findInternal(html, direction, options, (match) =>
		generateSelector(match.attributes, match.tagName),
	);
}

/**
 * Finds the next page link as an object containing URL and selector.
 *
 * @param html - HTML string to parse.
 * @param baseUrl - Base URL for resolving absolute paths.
 * @param options - Configuration options for the search.
 */
export function findNext(
	html: string,
	baseUrl: string,
	options?: FindNextOptions,
): NavigationResult | null {
	return find(html, baseUrl, "next", options);
}

/**
 * Finds the previous page link as an object containing URL and selector.
 *
 * @param html - HTML string to parse.
 * @param baseUrl - Base URL for resolving absolute paths.
 * @param options - Configuration options for the search.
 */
export function findPrev(
	html: string,
	baseUrl: string,
	options?: FindNextOptions,
): NavigationResult | null {
	return find(html, baseUrl, "prev", options);
}

/**
 * Finds the next page URL from HTML.
 *
 * @param html - HTML string to parse.
 * @param baseUrl - Base URL for resolving absolute paths.
 * @param options - Configuration options for the search.
 */
export function findNextURL(
	html: string,
	baseUrl: string,
	options?: FindNextOptions,
): string | null {
	return findURL(html, baseUrl, "next", options);
}

/**
 * Finds the previous page URL from HTML.
 *
 * @param html - HTML string to parse.
 * @param baseUrl - Base URL for resolving absolute paths.
 * @param options - Configuration options for the search.
 */
export function findPrevURL(
	html: string,
	baseUrl: string,
	options?: FindNextOptions,
): string | null {
	return findURL(html, baseUrl, "prev", options);
}

/**
 * Finds the next page selector from HTML.
 *
 * @param html - HTML string to parse.
 * @param options - Configuration options for the search.
 */
export function findNextSelector(
	html: string,
	options?: FindNextOptions,
): string | null {
	return findSelector(html, "next", options);
}

/**
 * Finds the previous page selector from HTML.
 *
 * @param html - HTML string to parse.
 * @param options - Configuration options for the search.
 */
export function findPrevSelector(
	html: string,
	options?: FindNextOptions,
): string | null {
	return findSelector(html, "prev", options);
}

// --- Inference Helpers ---

/**
 * Attempts to update a page number in the URL and verify its existence.
 *
 * @param currentUrl - Current URL.
 * @param updateFn - Function to increment/decrement number.
 * @param findFn - Function to find page number in URL.
 * @param rebuildFn - Function to rebuild URL with new page number.
 * @param options - Base configuration options.
 */
async function tryUpdatePageNumber(
	currentUrl: string,
	updateFn: (num: number) => number,
	findFn: (url: URL) => { key: string; value: number; prefix?: string } | null,
	rebuildFn: (
		url: URL,
		key: string,
		newValue: number,
		prefix?: string,
	) => string,
	options?: BaseOptions,
): Promise<string | null> {
	try {
		const urlObj = new URL(currentUrl);
		const result = findFn(urlObj);
		if (result) {
			const newNumber = updateFn(result.value);
			if (newNumber > 0) {
				const newUrl = rebuildFn(urlObj, result.key, newNumber, result.prefix);
				if (
					options?.verifyExists === false ||
					(await urlExists(newUrl, options))
				) {
					return newUrl;
				}
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		options?.logger?.("warn", `Error in URL inference: ${message}`);
	}
	return null;
}

/**
 * Infers next or previous page URL based on URL patterns.
 *
 * @param url - Current page URL.
 * @param direction - Direction to infer ("next" or "prev").
 * @param options - Base configuration options.
 */
async function findUrlByPattern(
	url: string,
	direction: Direction,
	options?: BaseOptions,
): Promise<string | null> {
	const update = (n: number) => (direction === "next" ? n + 1 : n - 1);

	// 1. Query Params
	const byQuery = await tryUpdatePageNumber(
		url,
		update,
		(u) => {
			for (const key of ["page", "p", "index"]) {
				const val = u.searchParams.get(key);
				if (val) {
					const num = parseInt(val, 10);
					if (!Number.isNaN(num)) return { key, value: num };
				}
			}
			return null;
		},
		(u, key, newVal) => {
			const newUrl = new URL(u.href);
			newUrl.searchParams.set(key, String(newVal));
			return newUrl.toString();
		},
		options,
	);
	if (byQuery) return byQuery;

	// 2. Path Segment
	return await tryUpdatePageNumber(
		url,
		update,
		(u) => {
			const match = u.pathname.replace(/\/$/, "").match(REGEX.PATH_PAGE_NUMBER);
			if (match) {
				const [_, prefix, numStr] = match;
				if (prefix !== undefined && numStr !== undefined) {
					return { key: "", value: parseInt(numStr, 10), prefix };
				}
			}
			return null;
		},
		(u, _, newVal, prefix) =>
			`${u.origin}${prefix}${newVal}${u.search}${u.hash}`,
		options,
	);
}

/**
 * Infers the next page URL based on URL patterns.
 *
 * @param url - Current page URL.
 * @param options - Base configuration options.
 */
export function findNextByUrl(
	url: string,
	options?: BaseOptions,
): Promise<string | null> {
	return findUrlByPattern(url, "next", options);
}

/**
 * Infers the previous page URL based on URL patterns.
 *
 * @param url - Current page URL.
 * @param options - Base configuration options.
 */
export function findPrevByUrl(
	url: string,
	options?: BaseOptions,
): Promise<string | null> {
	return findUrlByPattern(url, "prev", options);
}
