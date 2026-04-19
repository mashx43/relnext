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
export type Direction = "next" | "prev";

/** Internal match result. */
export interface Match {
	attributes: string;
	tagName: string;
	innerText?: string;
}

/**
 * Result of a navigation search.
 */
export interface NavigationResult {
	/** Absolute URL of the navigation link, if available. */
	url: string | null;
	/** CSS selector to identify the navigation element. */
	selector: string;
	/** The strategy method that found this match. */
	method: Method;
}
