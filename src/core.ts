import { REGEX } from "./constants";
import type {
	Direction,
	FindNextOptions,
	Match,
	Method,
	NavigationResult,
} from "./types";
import {
	extractAbsoluteHref,
	extractAttribute,
	generateSelector,
} from "./utils";

/**
 * Finds the first valid match and transforms it.
 */
export function findMatchInternal<T>(
	matches: IterableIterator<RegExpMatchArray>,
	predicate: (attributes: string, innerText?: string) => boolean,
	transform: (match: Match) => T | null,
): T | null {
	for (const match of matches) {
		const attributes = match.groups?.attributes ?? "";
		const tagName = match.groups?.tagName ?? "a";
		const innerText = match.groups?.innerText;
		if (predicate(attributes, innerText)) {
			const result = transform({ attributes, tagName, innerText });
			if (result) return result;
		}
	}
	return null;
}

export function findByRel<T>(
	html: string,
	relRegex: RegExp,
	transform: (match: Match) => T | null,
): T | null {
	return findMatchInternal(
		html.matchAll(REGEX.POTENTIAL_LINK_TAGS),
		(attributes) => relRegex.test(attributes),
		transform,
	);
}

export function findByPaginationStructure<T>(
	html: string,
	liRegex: RegExp,
	fallbackRegex: RegExp,
	textRegex: RegExp,
	transform: (match: Match) => T | null,
): T | null {
	for (const match of html.matchAll(REGEX.PAGINATION_CONTAINER)) {
		const containerHtml = match.groups?.containerHtml;
		if (!containerHtml) continue;

		// 1. Structural match
		const liMatch = containerHtml.match(liRegex);
		if (liMatch?.groups?.attributes) {
			const result = transform({
				attributes: liMatch.groups.attributes,
				tagName: "a",
			});
			if (result) return result;
		}

		const fallbackMatch = containerHtml.match(fallbackRegex);
		if (fallbackMatch?.groups?.attributes) {
			const result = transform({
				attributes: fallbackMatch.groups.attributes,
				tagName: "a",
			});
			if (result) return result;
		}

		// 2. Text match within container
		const resultByText = findByText(containerHtml, textRegex, transform);
		if (resultByText) return resultByText;
	}
	return null;
}

export function findByText<T>(
	html: string,
	textRegex: RegExp,
	transform: (match: Match) => T | null,
): T | null {
	return findMatchInternal(
		html.matchAll(REGEX.ANCHOR_TAG),
		(_, innerText) => {
			const cleanText = (innerText ?? "")
				.replace(REGEX.HTML_TAGS, "")
				.replace(REGEX.HTML_ENTITIES, "")
				.trim();
			return !!cleanText && textRegex.test(cleanText);
		},
		transform,
	);
}

export function findByClassName<T>(
	html: string,
	defaultRegex: RegExp,
	classNameRegex: RegExp | undefined,
	transform: (match: Match) => T | null,
): T | null {
	return findMatchInternal(
		html.matchAll(REGEX.ANCHOR_TAG_START),
		(attributes) => {
			const classAttr = extractAttribute(attributes, "class");
			const idAttr = extractAttribute(attributes, "id");
			return !!(
				(classAttr && (classNameRegex ?? defaultRegex).test(classAttr)) ||
				(idAttr && defaultRegex.test(idAttr))
			);
		},
		transform,
	);
}

export function findByAriaLabel<T>(
	html: string,
	textRegex: RegExp,
	transform: (match: Match) => T | null,
): T | null {
	return findMatchInternal(
		html.matchAll(REGEX.ANCHOR_TAG_START),
		(attributes) => {
			const ariaLabel = extractAttribute(attributes, "aria-label");
			return !!(ariaLabel && textRegex.test(ariaLabel));
		},
		transform,
	);
}

export function findByAltText<T>(
	html: string,
	textRegex: RegExp,
	transform: (match: Match) => T | null,
): T | null {
	return findMatchInternal(
		html.matchAll(REGEX.ANCHOR_TAG),
		(_, innerText) => {
			for (const [imgTag] of (innerText ?? "").matchAll(REGEX.IMG_TAG)) {
				const altText = extractAttribute(imgTag, "alt");
				if (altText && textRegex.test(altText.trim())) return true;
			}
			return false;
		},
		transform,
	);
}

/**
 * Finds next or previous page link or selector from HTML.
 */
export function findInternal<T>(
	html: string,
	direction: Direction,
	options: FindNextOptions | undefined,
	transform: (match: Match) => T | null,
): T | null {
	const methods: Method[] = options?.methods ?? [
		"rel",
		"pagination",
		"text",
		"className",
		"aria-label",
		"alt",
	];
	const excludedHtml = html.replace(REGEX.ARTICLE_EXCLUDE, "");

	const strategies: Record<Method, (h: string) => T | null> = {
		rel: (h) => findByRel(h, REGEX.REL[direction], transform),
		pagination: (h) =>
			findByPaginationStructure(
				h,
				REGEX.PAGINATION_LI[direction],
				REGEX.PAGINATION_FALLBACK[direction],
				REGEX.TEXT[direction],
				transform,
			),
		text: (h) => findByText(h, REGEX.TEXT[direction], transform),
		className: (h) =>
			findByClassName(
				h,
				REGEX.CLASS_NAME[direction],
				options?.classNameRegex,
				transform,
			),
		"aria-label": (h) => findByAriaLabel(h, REGEX.TEXT[direction], transform),
		alt: (h) => findByAltText(h, REGEX.TEXT[direction], transform),
	};

	for (const method of methods) {
		const targetHtml = ["text", "className", "aria-label", "alt"].includes(
			method,
		)
			? excludedHtml
			: html;
		const result = strategies[method](targetHtml);
		if (result) return result;
	}

	return null;
}

/**
 * Finds the best matching navigation result.
 * Returns the first matching element regardless of whether it has an href.
 */
export function findResultInternal(
	html: string,
	baseUrl: string,
	direction: Direction,
	options?: FindNextOptions,
): NavigationResult | null {
	const methods: Method[] = options?.methods ?? [
		"rel",
		"pagination",
		"text",
		"className",
		"aria-label",
		"alt",
	];
	const excludedHtml = html.replace(REGEX.ARTICLE_EXCLUDE, "");

	for (const method of methods) {
		const targetHtml = ["text", "className", "aria-label", "alt"].includes(
			method,
		)
			? excludedHtml
			: html;

		const transform = (match: Match): NavigationResult => ({
			url: extractAbsoluteHref(match.attributes, baseUrl, options),
			selector: generateSelector(match.attributes, match.tagName),
			method,
		});

		let result: NavigationResult | null = null;
		switch (method) {
			case "rel":
				result = findByRel(targetHtml, REGEX.REL[direction], transform);
				break;
			case "pagination":
				result = findByPaginationStructure(
					targetHtml,
					REGEX.PAGINATION_LI[direction],
					REGEX.PAGINATION_FALLBACK[direction],
					REGEX.TEXT[direction],
					transform,
				);
				break;
			case "text":
				result = findByText(targetHtml, REGEX.TEXT[direction], transform);
				break;
			case "className":
				result = findByClassName(
					targetHtml,
					REGEX.CLASS_NAME[direction],
					options?.classNameRegex,
					transform,
				);
				break;
			case "aria-label":
				result = findByAriaLabel(targetHtml, REGEX.TEXT[direction], transform);
				break;
			case "alt":
				result = findByAltText(targetHtml, REGEX.TEXT[direction], transform);
				break;
		}
		if (result) return result;
	}

	return null;
}
