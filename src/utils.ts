import { DEFAULT_TIMEOUT_MS } from "./constants";
import type { BaseOptions } from "./types";

const attributeRegexCache = new Map<string, RegExp>();

/**
 * Escapes a string for use in a CSS selector attribute value.
 */
function escapeCSS(str: string): string {
	return str.replace(/['"\\#]/g, "\\$&");
}

/**
 * Extracts the value of a specific attribute from an attributes string.
 */
export function extractAttribute(
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
 */
export function extractAbsoluteHref(
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
 */
export async function urlExists(
	url: string,
	options?: BaseOptions,
): Promise<boolean> {
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

/**
 * Generates a CSS selector for an element based on its attributes.
 */
export function generateSelector(attributes: string, tagName: string): string {
	const id = extractAttribute(attributes, "id");
	if (id) return `#${escapeCSS(id)}`;

	const classAttr = extractAttribute(attributes, "class");
	const classes = classAttr
		? `.${classAttr
				.trim()
				.split(/\s+/)
				.filter(Boolean)
				.map(escapeCSS)
				.join(".")}`
		: "";

	const relAttr = extractAttribute(attributes, "rel");
	// Use single quotes for CSS attributes to minimize conflict with JS double-quoted strings
	const rel = relAttr ? `[rel~='${escapeCSS(relAttr)}']` : "";

	let selector = tagName;
	if (classes) selector += classes;
	if (rel) selector += rel;

	if (selector === tagName) {
		const ariaLabel = extractAttribute(attributes, "aria-label");
		if (ariaLabel) selector += `[aria-label='${escapeCSS(ariaLabel)}']`;
	}

	return selector;
}

/**
 * Fetches HTML content from a URL.
 *
 * @param url - URL to fetch.
 * @param options - Base configuration options.
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
