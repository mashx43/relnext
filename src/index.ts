// src/index.ts

export interface BaseOptions {
	logger?: (level: "warn" | "error", message: string) => void;
	timeout?: number;
	verifyExists?: boolean;
}

export type Method =
	| "rel"
	| "pagination"
	| "text"
	| "className"
	| "aria-label"
	| "alt";

export interface FindNextOptions extends BaseOptions {
	methods?: Method[];
	classNameRegex?: RegExp;
}

type Direction = "next" | "prev";

const REGEX = {
	REL: {
		next: /rel\s*=\s*(['"])[^'"]*?\bnext\b[^'"]*?\1/i,
		prev: /rel\s*=\s*(['"])[^'"]*?\b(prev|previous)\b[^'"]*?\1/i,
	},
	TEXT: {
		next: /^\s*(((Next)\s*(page)?|older|forward)|((次|つぎ)(のページ)?(へ)?)|((下|后)\s*(一)?(页|頁))|(다음)|»|>|→)\s*>*$/i,
		prev: /^\s*<*(((Prev|Previous)\s*(page)?|older|back)|((前)(のページ)?(へ)?)|((上|前)\s*(一)?(页|頁))|(이전)|«|<|←)\s*$/i,
	},
	CLASS_NAME: {
		next: /next/i,
		prev: /prev|previous/i,
	},
	PAGINATION_LI: {
		// Extracts attributes of an <a> tag within an <li> element that follows a current/active <li> element (e.g., <li class="current">1</li> <li class=""><a href="/page/2">2</a></li>)
		next: /<li[^>]+class\s*=\s*['"][^'"]*(?:current|active)[^'"]*['"][^>]*>.*?<\/li>\s*<li[^>]*>\s*<a\s+(?<attributes>[^>]+)>/is,
		// Extracts attributes of an <a> tag within an <li> element that precedes a current/active <li> element (e.g., <li class=""><a href="/page/1">1</a></li> <li class="current">2</li>)
		prev: /<li[^>]*>\s*<a\s+(?<attributes>[^>]+)>.*?<\/a>\s*<\/li>\s*<li[^>]+class\s*=\s*['"][^'"]*(?:current|active)[^'"]*['"][^>]*>/is,
	},
	PAGINATION_FALLBACK: {
		// Extracts attributes of an <a> tag that follows a current/active element (span, a, or strong tag with current/active class or aria-current="page").
		// This handles cases where there's no <li> element structure or for more general pagination.
		// Example: <span class="current">1</span> <a href="/page/2">2</a>
		next: /(?:<(?:span|a)[^>]+(?:class\s*=\s*['"](?:current|active)['"]|aria-current\s*=\s*['"]page['"])|strong)\s*[^<]*\s*<\/(?:span|a|strong)>\s*<a\s+(?<attributes>[^>]+)>/i,
		// Extracts attributes of an <a> tag that precedes a current/active element.
		// Example: <a href="/page/1">1</a> <span class="current">2</span>
		prev: /<a\s+(?<attributes>[^>]+)>.*?<\/a>\s*(?:<(?:span|a)[^>]+(?:class\s*=\s*['"](?:current|active)['"]|aria-current\s*=\s*['"]page['"])|strong)\s*[^<]*/i,
	},
	// Common Regex
	POTENTIAL_LINK_TAGS: /<(?:a|link)\s+(?<attributes>[^>]*?)>/gi,
	ANCHOR_TAG: /<a\s+(?<attributes>[^>]+)>(?<innerText>.*?)<\/a>/gis,
	ANCHOR_TAG_START: /<a\s+(?<attributes>[^>]+)>/gi,
	PAGINATION_CONTAINER:
		/<(?:div|nav|ul)[^>]+(?:class|id)\s*=\s*['"][^'"]*(?:pagination|pager|page-nav)[^'"]*['"][^>]*>(?<containerHtml>[\s\S]*?)<\/(?:div|nav|ul)>/gi,
	IMG_TAG: /<img[^>]+>/gi,
	PATH_PAGE_NUMBER: /^(.*[/\-_])(\d+)$/,
	HTML_TAGS: /<[^>]+>/g,
	HTML_ENTITIES: /&[a-z]+;|&#[0-9]+;|&#x[0-9a-f]+;/gi,
};

const DEFAULT_TIMEOUT_MS = 8000;

const attributeRegexCache = new Map<string, RegExp>();

/**
 * Extracts the value of a specified attribute from an attribute string.
 * @param attributes The string containing attributes.
 * @param attributeName The name of the attribute to extract (e.g., "href", "class", "id").
 * @returns The value of the attribute, or null if not found.
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
 * Extracts the href attribute from an attribute string and converts it to an absolute URL.
 * @param attributes The string containing attributes.
 * @param baseUrl The base URL for resolving relative paths.
 * @returns The absolute URL, or null if not found/invalid.
 */
function extractAbsoluteHref(
	attributes: string,
	baseUrl: string,
	options?: BaseOptions,
): string | null {
	const href = extractAttribute(attributes, "href");
	if (href) {
		try {
			return new URL(href, baseUrl).href;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			options?.logger?.(
				"warn",
				`Invalid URL '${href}' for base '${baseUrl}': ${message}`,
			);
			return null;
		}
	}
	return null;
}

/**
 * Asynchronously fetches HTML content from a given URL.
 * @param url The URL to fetch.
 * @param options Options.
 * @returns The HTML string, or null if fetching failed.
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

function findLinkByRel(
	html: string,
	baseUrl: string,
	relRegex: RegExp,
	options?: BaseOptions,
): string | null {
	const allPotentialLinks = html.matchAll(REGEX.POTENTIAL_LINK_TAGS);

	for (const match of allPotentialLinks) {
		const attributes = match.groups?.attributes;
		if (!attributes) {
			continue;
		}

		if (relRegex.test(attributes)) {
			const absoluteUrl = extractAbsoluteHref(attributes, baseUrl, options);
			if (absoluteUrl) {
				return absoluteUrl;
			}
		}
	}

	return null;
}

function findLinkByPaginationStructure(
	html: string,
	baseUrl: string,
	liRegex: RegExp,
	fallbackRegex: RegExp,
	options?: BaseOptions,
): string | null {
	const paginationContainers = html.matchAll(REGEX.PAGINATION_CONTAINER);

	for (const match of paginationContainers) {
		const containerHtml = match.groups?.containerHtml;

		if (!containerHtml) {
			continue;
		}

		const liMatch = containerHtml.match(liRegex);
		if (liMatch?.groups?.attributes) {
			const absoluteUrl = extractAbsoluteHref(
				liMatch.groups.attributes,
				baseUrl,
				options,
			);
			if (absoluteUrl) {
				return absoluteUrl;
			}
		}

		const fallbackMatch = containerHtml.match(fallbackRegex);
		if (fallbackMatch?.groups?.attributes) {
			const absoluteUrl = extractAbsoluteHref(
				fallbackMatch.groups.attributes,
				baseUrl,
				options,
			);
			if (absoluteUrl) {
				return absoluteUrl;
			}
		}
	}

	return null;
}

function findLinkByText(
	html: string,
	baseUrl: string,
	textRegex: RegExp,
	options?: BaseOptions,
): string | null {
	const anchorTags = html.matchAll(REGEX.ANCHOR_TAG);

	for (const match of anchorTags) {
		const attributes = match.groups?.attributes;
		const innerText = match.groups?.innerText;

		if (!attributes || !innerText) {
			continue;
		}

		const cleanText = innerText
			.replace(REGEX.HTML_TAGS, "")
			.replace(REGEX.HTML_ENTITIES, "")
			.trim();
		if (!cleanText) {
			continue;
		}

		if (textRegex.test(cleanText)) {
			const absoluteUrl = extractAbsoluteHref(attributes, baseUrl, options);
			if (absoluteUrl) {
				return absoluteUrl;
			}
		}
	}

	return null;
}

function findLinkByClassName(
	html: string,
	baseUrl: string,
	defaultRegex: RegExp,
	classNameRegex?: RegExp,
	options?: BaseOptions,
): string | null {
	const anchorTags = html.matchAll(REGEX.ANCHOR_TAG_START);

	for (const match of anchorTags) {
		const attributes = match.groups?.attributes;
		if (!attributes) {
			continue;
		}

		const classAttr = extractAttribute(attributes, "class");
		const idAttr = extractAttribute(attributes, "id");

		if (
			(classAttr && (classNameRegex ?? defaultRegex).test(classAttr)) ||
			(idAttr && defaultRegex.test(idAttr))
		) {
			const absoluteUrl = extractAbsoluteHref(attributes, baseUrl, options);
			if (absoluteUrl) {
				return absoluteUrl;
			}
		}
	}

	return null;
}

function findLinkByAriaLabel(
	html: string,
	baseUrl: string,
	textRegex: RegExp,
	options?: BaseOptions,
): string | null {
	const anchorTags = html.matchAll(REGEX.ANCHOR_TAG_START);

	for (const match of anchorTags) {
		const attributes = match.groups?.attributes;
		if (!attributes) {
			continue;
		}

		const ariaLabelAttr = extractAttribute(attributes, "aria-label");
		if (ariaLabelAttr && textRegex.test(ariaLabelAttr)) {
			const absoluteUrl = extractAbsoluteHref(attributes, baseUrl, options);
			if (absoluteUrl) {
				return absoluteUrl;
			}
		}
	}

	return null;
}

function findLinkByAltText(
	html: string,
	baseUrl: string,
	textRegex: RegExp,
	options?: BaseOptions,
): string | null {
	const anchorTags = html.matchAll(REGEX.ANCHOR_TAG);

	for (const match of anchorTags) {
		const attributes = match.groups?.attributes;
		const innerHtml = match.groups?.innerText;

		if (!attributes || !innerHtml) {
			continue;
		}

		const imgTags = innerHtml.matchAll(REGEX.IMG_TAG);
		for (const [imgTag] of imgTags) {
			const altText = extractAttribute(imgTag, "alt");
			if (altText && textRegex.test(altText.trim())) {
				const absoluteUrl = extractAbsoluteHref(attributes, baseUrl, options);
				if (absoluteUrl) {
					return absoluteUrl;
				}
			}
		}
	}

	return null;
}

function findLink(
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

	// Dispatch table (map of strategies)
	const strategies: { [key in Method]: () => string | null } = {
		rel: () => findLinkByRel(html, baseUrl, REGEX.REL[direction], options),
		pagination: () =>
			findLinkByPaginationStructure(
				html,
				baseUrl,
				REGEX.PAGINATION_LI[direction],
				REGEX.PAGINATION_FALLBACK[direction],
				options,
			),
		text: () => findLinkByText(html, baseUrl, REGEX.TEXT[direction], options),
		className: () =>
			findLinkByClassName(
				html,
				baseUrl,
				REGEX.CLASS_NAME[direction],
				options?.classNameRegex,
				options,
			),
		"aria-label": () =>
			findLinkByAriaLabel(html, baseUrl, REGEX.TEXT[direction], options),
		alt: () => findLinkByAltText(html, baseUrl, REGEX.TEXT[direction], options),
	};

	for (const method of methods) {
		const url = strategies[method]();
		if (url) {
			return url;
		}
	}

	return null;
}

/**
 * Attempts multiple strategies in order to find the next page link URL from an HTML string.
 * @param html The HTML string to parse.
 * @param baseUrl The base URL from which the HTML was fetched (for resolving relative paths).
 * @param options Options for specifying search strategies.
 * @returns The URL of the next page, or null if not found.
 */
export function findNext(
	html: string,
	baseUrl: string,
	options?: FindNextOptions,
): string | null {
	return findLink(html, baseUrl, "next", options);
}

/**
 * Attempts multiple strategies in order to find the previous page link URL from an HTML string.
 * @param html The HTML string to parse.
 * @param baseUrl The base URL from which the HTML was fetched.
 * @param options Options for specifying search strategies.
 * @returns The URL of the previous page, or null if not found.
 */
export function findPrev(
	html: string,
	baseUrl: string,
	options?: FindNextOptions,
): string | null {
	return findLink(html, baseUrl, "prev", options);
}

/**
 * Checks if a URL actually exists using a HEAD request.
 * @param url The URL to check.
 * @returns True if the URL exists, false otherwise.
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

async function findUrlByQueryParam(
	url: string,
	direction: Direction,
	options?: BaseOptions,
): Promise<string | null> {
	try {
		const urlObject = new URL(url);
		const params = urlObject.searchParams;
		let targetKey: string | null = null;
		let currentValue: number | null = null;

		for (const key of ["page", "p", "index"]) {
			const value = params.get(key);
			if (value) {
				const num = parseInt(value, 10);
				if (!Number.isNaN(num)) {
					targetKey = key;
					currentValue = num;
					break;
				}
			}
		}

		if (targetKey && currentValue !== null) {
			const newNumber =
				direction === "next" ? currentValue + 1 : currentValue - 1;

			if (newNumber > 0) {
				params.set(targetKey, String(newNumber));
				const newUrl = urlObject.toString();
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
		options?.logger?.(
			"warn",
			`Invalid URL provided to findUrlByQueryParam: ${message}`,
		);
	}

	return null;
}

async function findUrlByPathSegment(
	url: string,
	direction: Direction,
	options?: BaseOptions,
): Promise<string | null> {
	try {
		const urlObject = new URL(url);
		const pathname = urlObject.pathname.replace(/\/$/, "");
		const pathMatch = pathname.match(REGEX.PATH_PAGE_NUMBER);

		if (pathMatch) {
			const [_, prefix, currentNumberStr] = pathMatch;
			if (prefix && currentNumberStr) {
				const currentNumber = parseInt(currentNumberStr, 10);
				const newNumber =
					direction === "next" ? currentNumber + 1 : currentNumber - 1;

				if (newNumber > 0) {
					const newPath = `${prefix}${newNumber}`;
					const newUrl = `${urlObject.origin}${newPath}${urlObject.search}${urlObject.hash}`;
					if (
						options?.verifyExists === false ||
						(await urlExists(newUrl, options))
					) {
						return newUrl;
					}
				}
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		options?.logger?.(
			"warn",
			`Invalid URL provided to findUrlByPathSegment: ${message}`,
		);
	}

	return null;
}

/**
 * Asynchronously infers and finds the next/previous page URL based on URL patterns.
 * @param url The URL of the current page.
 * @param direction "next" or "prev".
 * @param options Options for URL pattern inference.
 * @returns The next/previous page URL, or null if not found.
 */
async function findUrlByPattern(
	url: string,
	direction: Direction,
	options?: BaseOptions,
): Promise<string | null> {
	const urlByQuery = await findUrlByQueryParam(url, direction, options);
	if (urlByQuery) {
		return urlByQuery;
	}

	const urlByPath = await findUrlByPathSegment(url, direction, options);
	if (urlByPath) {
		return urlByPath;
	}

	return null;
}

/**
 * Asynchronously infers and finds the next page URL based on URL patterns.
 * Increments the page number in the URL and checks if the URL exists.
 * @param url The URL of the current page.
 * @param options Options for URL pattern inference.
 * @returns The next page URL, or null if not found.
 */
export function findNextByUrl(
	url: string,
	options?: BaseOptions,
): Promise<string | null> {
	return findUrlByPattern(url, "next", options);
}

/**
 * Asynchronously infers and finds the previous page URL based on URL patterns.
 * @param url The URL of the current page.
 * @param options Options for URL pattern inference.
 * @returns The previous page URL, or null if not found.
 */
export function findPrevByUrl(
	url: string,
	options?: BaseOptions,
): Promise<string | null> {
	return findUrlByPattern(url, "prev", options);
}
