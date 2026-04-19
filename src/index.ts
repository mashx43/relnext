// src/index.ts

// --- Types ---

/**
 * Base options for configuration.
 */
export interface BaseOptions {
	/** Logger function for warnings and errors. */
	logger?: (level: "warn" | "error", message: string) => void;
	/** Timeout in milliseconds for network requests. */
	timeout?: number;
	/** Whether to verify if the inferred URL actually exists. */
	verifyExists?: boolean;
}

/** Strategies for finding links. */
export type Method =
	| "rel"
	| "pagination"
	| "text"
	| "className"
	| "aria-label"
	| "alt";

/**
 * Options for findNext and findPrev functions.
 */
export interface FindNextOptions extends BaseOptions {
	/** List of search strategies to use (executed in the specified order). */
	methods?: Method[];
	/** Custom regular expression for className-based search. */
	classNameRegex?: RegExp;
}

/** Direction to search. */
type Direction = "next" | "prev";

// --- Constants & Regex ---

const REGEX = {
	REL: {
		next: /rel\s*=\s*(['"])[^'"]*?\bnext\b[^'"]*?\1/i,
		prev: /rel\s*=\s*(['"])[^'"]*?\b(prev|previous)\b[^'"]*?\1/i,
	},
	TEXT: {
		next: /^\s*(((Next|older)\s*(page|post(s)?)?|forward)|((次|つぎ)(のページ)?(へ)?)|((下|后)\s*(一)?(页|頁))|(다음)|»|>|→)\s*[»>→]*$/i,
		prev: /^\s*[«<←]*\s*(((Prev|Previous|newer)\s*(page|post(s)?)?|back)|((前)(のページ)?(へ)?)|((上|前)\s*(一)?(页|頁))|(이전)|«|<|←)\s*$/i,
	},
	CLASS_NAME: {
		next: /next/i,
		prev: /prev|previous/i,
	},
	PAGINATION_LI: {
		next: /<li[^>]+(?:class\s*=\s*['"][^'"]*(?:current|active|is-active|selected)[^'"]*['"]|aria-current\s*=\s*['"]page['"]|aria-selected\s*=\s*['"]true['"])[^>]*>.*?<\/li>\s*<li[^>]*>\s*<a\s+(?<attributes>[^>]+)>/is,
		prev: /<li[^>]*>\s*<a\s+(?<attributes>[^>]+)>.*?<\/a>\s*<\/li>\s*<li[^>]+(?:class\s*=\s*['"][^'"]*(?:current|active|is-active|selected)[^'"]*['"]|aria-current\s*=\s*['"]page['"]|aria-selected\s*=\s*['"]true['"])[^>]*>/is,
	},
	PAGINATION_FALLBACK: {
		next: /<(?:span|a|div)[^>]*?\b(?:class\s*=\s*['"][^'"]*?\b(current|active|is-active|selected)\b[^'"]*?['"]|aria-current\s*=\s*['"]page['"]|aria-selected\s*=\s*['"]true['"])[^>]*?>.*?<\/(?:span|a|div)>[\s\u00a0·|/]*<a\s+(?<attributes>[^>]+)>/is,
		prev: /<a\s+(?<attributes>[^>]+)>.*?<\/a>[\s\u00a0·|/]*<(?:span|a|div)[^>]*?\b(?:class\s*=\s*['"][^'"]*?\b(current|active|is-active|selected)\b[^'"]*?['"]|aria-current\s*=\s*['"]page['"]|aria-selected\s*=\s*['"]true['"])[^>]*?>.*?<\/(?:span|a|div)>/is,
	},
	POTENTIAL_LINK_TAGS: /<(?:a|link)\s+(?<attributes>[^>]*?)>/gi,
	ANCHOR_TAG: /<a\s+(?<attributes>[^>]+)>(?<innerText>.*?)<\/a>/gis,
	ANCHOR_TAG_START: /<a\s+(?<attributes>[^>]+)>/gi,
	PAGINATION_CONTAINER:
		/<(?:div|nav|ul)[^>]+(?:class|id)\s*=\s*['"][^'"]*(?:pagination|pager|page-nav)[^'"]*['"][^>]*>(?<containerHtml>[\s\S]*?)<\/(?:div|nav|ul)>/gi,
	ARTICLE_EXCLUDE: /<(?:p|article)[^>]*?>[\s\S]*?<\/(?:p|article)>/gi,
	IMG_TAG: /<img[^>]+>/gi,
	PATH_PAGE_NUMBER: /^(.*[/\-_])(\d+)$/,
	HTML_TAGS: /<[^>]+>/g,
	HTML_ENTITIES: /&[a-z]+;|&#[0-9]+;|&#x[0-9a-f]+;/gi,
};

const DEFAULT_TIMEOUT_MS = 8000;
const attributeRegexCache = new Map<string, RegExp>();

// --- Utilities ---

/**
 * Extracts the value of a specific attribute from an attributes string.
 * @param attributes String containing attributes.
 * @param attributeName Name of the attribute to extract (e.g., "href", "class").
 * @returns The attribute value, or null if not found.
 */
function extractAttribute(
	attributes: string,
	attributeName: string,
): string | null {
	let regex = attributeRegexCache.get(attributeName);
	if (!regex) {
		regex = new RegExp(
			`${attributeName}\\s*=\\s*(['"])(?<value>[^"']*)\\1`,
			"i",
		);
		attributeRegexCache.set(attributeName, regex);
	}
	const match = attributes.match(regex);
	return match?.groups?.value ?? null;
}

/**
 * Extracts href from attributes and converts it to an absolute URL.
 * @param attributes String containing attributes.
 * @param baseUrl Base URL for resolving relative paths.
 * @param options Base options.
 * @returns Absolute URL, or null if invalid.
 */
function extractAbsoluteHref(
	attributes: string,
	baseUrl: string,
	options?: BaseOptions,
): string | null {
	const href = extractAttribute(attributes, "href");
	if (!href) return null;

	const decodedHref = href.replace(/&amp;/g, "&");
	try {
		return new URL(decodedHref, baseUrl).href;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		options?.logger?.(
			"warn",
			`Invalid URL '${href}' for base '${baseUrl}': ${message}`,
		);
		return null;
	}
}

/**
 * Checks if a URL actually exists using a HEAD request.
 * @param url URL to check.
 * @param options Base options.
 * @returns True if the URL exists.
 */
async function urlExists(url: string, options?: BaseOptions): Promise<boolean> {
	const controller = new AbortController();
	const timeoutId = setTimeout(
		() => controller.abort(),
		options?.timeout ?? DEFAULT_TIMEOUT_MS,
	);

	try {
		const response = await fetch(url, {
			method: "HEAD",
			signal: controller.signal,
		});
		return response.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timeoutId);
	}
}

// --- Internal Helper: findFirstValidUrl ---

/**
 * Finds the first valid absolute URL from regex matches.
 * @param matches Iterator of RegExpMatchArray.
 * @param baseUrl Base URL for resolution.
 * @param options Base options.
 * @param extractor Function to extract attribute string from a match.
 * @returns The first valid absolute URL found, or null.
 */
function findFirstValidUrl(
	matches: IterableIterator<RegExpMatchArray>,
	baseUrl: string,
	options: BaseOptions | undefined,
	extractor: (match: RegExpMatchArray) => string | null | undefined,
): string | null {
	for (const match of matches) {
		const attributes = extractor(match);
		if (attributes) {
			const url = extractAbsoluteHref(attributes, baseUrl, options);
			if (url) return url;
		}
	}
	return null;
}

// --- Search Strategies ---

function findLinkByRel(
	html: string,
	baseUrl: string,
	relRegex: RegExp,
	options?: BaseOptions,
): string | null {
	return findFirstValidUrl(
		html.matchAll(REGEX.POTENTIAL_LINK_TAGS),
		baseUrl,
		options,
		(match) =>
			relRegex.test(match.groups?.attributes ?? "")
				? match.groups?.attributes
				: null,
	);
}

function findLinkByPaginationStructure(
	html: string,
	baseUrl: string,
	liRegex: RegExp,
	fallbackRegex: RegExp,
	textRegex: RegExp,
	options?: BaseOptions,
): string | null {
	for (const match of html.matchAll(REGEX.PAGINATION_CONTAINER)) {
		const containerHtml = match.groups?.containerHtml;
		if (!containerHtml) continue;

		// 1. Structural match
		const liMatch = containerHtml.match(liRegex);
		if (liMatch?.groups?.attributes) {
			const url = extractAbsoluteHref(
				liMatch.groups.attributes,
				baseUrl,
				options,
			);
			if (url) return url;
		}

		const fallbackMatch = containerHtml.match(fallbackRegex);
		if (fallbackMatch?.groups?.attributes) {
			const url = extractAbsoluteHref(
				fallbackMatch.groups.attributes,
				baseUrl,
				options,
			);
			if (url) return url;
		}

		// 2. Text match within container
		const urlByText = findLinkByText(
			containerHtml,
			baseUrl,
			textRegex,
			options,
		);
		if (urlByText) return urlByText;
	}
	return null;
}

function findLinkByText(
	html: string,
	baseUrl: string,
	textRegex: RegExp,
	options?: BaseOptions,
): string | null {
	return findFirstValidUrl(
		html.matchAll(REGEX.ANCHOR_TAG),
		baseUrl,
		options,
		(match) => {
			const innerText = match.groups?.innerText ?? "";
			const cleanText = innerText
				.replace(REGEX.HTML_TAGS, "")
				.replace(REGEX.HTML_ENTITIES, "")
				.trim();
			return cleanText && textRegex.test(cleanText)
				? match.groups?.attributes
				: null;
		},
	);
}

function findLinkByClassName(
	html: string,
	baseUrl: string,
	defaultRegex: RegExp,
	classNameRegex?: RegExp,
	options?: BaseOptions,
): string | null {
	return findFirstValidUrl(
		html.matchAll(REGEX.ANCHOR_TAG_START),
		baseUrl,
		options,
		(match) => {
			const attributes = match.groups?.attributes ?? "";
			const classAttr = extractAttribute(attributes, "class");
			const idAttr = extractAttribute(attributes, "id");
			const isMatch =
				(classAttr && (classNameRegex ?? defaultRegex).test(classAttr)) ||
				(idAttr && defaultRegex.test(idAttr));
			return isMatch ? attributes : null;
		},
	);
}

function findLinkByAriaLabel(
	html: string,
	baseUrl: string,
	textRegex: RegExp,
	options?: BaseOptions,
): string | null {
	return findFirstValidUrl(
		html.matchAll(REGEX.ANCHOR_TAG_START),
		baseUrl,
		options,
		(match) => {
			const attributes = match.groups?.attributes ?? "";
			const ariaLabel = extractAttribute(attributes, "aria-label");
			return ariaLabel && textRegex.test(ariaLabel) ? attributes : null;
		},
	);
}

function findLinkByAltText(
	html: string,
	baseUrl: string,
	textRegex: RegExp,
	options?: BaseOptions,
): string | null {
	return findFirstValidUrl(
		html.matchAll(REGEX.ANCHOR_TAG),
		baseUrl,
		options,
		(match) => {
			const innerHtml = match.groups?.innerText ?? "";
			for (const [imgTag] of innerHtml.matchAll(REGEX.IMG_TAG)) {
				const altText = extractAttribute(imgTag, "alt");
				if (altText && textRegex.test(altText.trim())) {
					return match.groups?.attributes;
				}
			}
			return null;
		},
	);
}

// --- Inference Helpers ---

/**
 * Attempts to update a page number in the URL and verify its existence.
 * @param currentUrl Current URL.
 * @param updateFn Function to increment/decrement number.
 * @param findFn Function to find page number in URL.
 * @param rebuildFn Function to rebuild URL with new page number.
 * @param options Base options.
 * @returns The new URL if found and valid, or null.
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

// --- Public APIs ---

/**
 * Fetches HTML content from a URL.
 * @param url URL to fetch.
 * @param options Base options.
 * @returns HTML string, or null if failed.
 */
export async function fetchHtml(
	url: string,
	options?: BaseOptions,
): Promise<string | null> {
	const controller = new AbortController();
	const timeoutId = setTimeout(
		() => controller.abort(),
		options?.timeout ?? DEFAULT_TIMEOUT_MS,
	);

	try {
		const response = await fetch(url, { signal: controller.signal });
		if (!response.ok) {
			options?.logger?.(
				"warn",
				`Failed to fetch ${url}: ${response.status} ${response.statusText}`,
			);
			return null;
		}

		const contentType = response.headers.get("content-type");
		if (!contentType || !contentType.includes("text/html")) {
			options?.logger?.("warn", `URL ${url} did not return HTML content.`);
			return null;
		}

		return await response.text();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		options?.logger?.("error", `Error fetching or parsing ${url}: ${message}`);
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Finds next or previous page link from HTML.
 * @param html HTML string to parse.
 * @param baseUrl Base URL for resolving paths.
 * @param direction Direction to search ("next" or "prev").
 * @param options FindNext options.
 * @returns Found URL, or null.
 */
export function findLink(
	html: string,
	baseUrl: string,
	direction: Direction,
	options?: FindNextOptions,
): string | null {
	const methods: Method[] = options?.methods ?? [
		"rel",
		"pagination",
		"text",
		"className",
		"aria-label",
		"alt",
	];
	const excludedHtml = html.replace(REGEX.ARTICLE_EXCLUDE, "");

	const strategies: Record<Method, (h: string) => string | null> = {
		rel: (h) => findLinkByRel(h, baseUrl, REGEX.REL[direction], options),
		pagination: (h) =>
			findLinkByPaginationStructure(
				h,
				baseUrl,
				REGEX.PAGINATION_LI[direction],
				REGEX.PAGINATION_FALLBACK[direction],
				REGEX.TEXT[direction],
				options,
			),
		text: (h) => findLinkByText(h, baseUrl, REGEX.TEXT[direction], options),
		className: (h) =>
			findLinkByClassName(
				h,
				baseUrl,
				REGEX.CLASS_NAME[direction],
				options?.classNameRegex,
				options,
			),
		"aria-label": (h) =>
			findLinkByAriaLabel(h, baseUrl, REGEX.TEXT[direction], options),
		alt: (h) => findLinkByAltText(h, baseUrl, REGEX.TEXT[direction], options),
	};

	for (const method of methods) {
		const targetHtml = ["text", "className", "aria-label", "alt"].includes(
			method,
		)
			? excludedHtml
			: html;
		const url = strategies[method](targetHtml);
		if (url) return url;
	}

	return null;
}

/**
 * Finds the next page link from HTML.
 * @param html HTML string to parse.
 * @param baseUrl Base URL for resolving paths.
 * @param options FindNext options.
 * @returns Next page URL, or null.
 */
export function findNext(
	html: string,
	baseUrl: string,
	options?: FindNextOptions,
): string | null {
	return findLink(html, baseUrl, "next", options);
}

/**
 * Finds the previous page link from HTML.
 * @param html HTML string to parse.
 * @param baseUrl Base URL for resolving paths.
 * @param options FindNext options.
 * @returns Previous page URL, or null.
 */
export function findPrev(
	html: string,
	baseUrl: string,
	options?: FindNextOptions,
): string | null {
	return findLink(html, baseUrl, "prev", options);
}

/**
 * Infers next or previous page URL based on URL patterns.
 * @param url Current page URL.
 * @param direction Direction to infer.
 * @param options Base options.
 * @returns Inferred URL, or null.
 */
export async function findUrlByPattern(
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
 * @param url Current page URL.
 * @param options Base options.
 * @returns Next page URL, or null.
 */
export function findNextByUrl(
	url: string,
	options?: BaseOptions,
): Promise<string | null> {
	return findUrlByPattern(url, "next", options);
}

/**
 * Infers the previous page URL based on URL patterns.
 * @param url Current page URL.
 * @param options Base options.
 * @returns Previous page URL, or null.
 */
export function findPrevByUrl(
	url: string,
	options?: BaseOptions,
): Promise<string | null> {
	return findUrlByPattern(url, "prev", options);
}
