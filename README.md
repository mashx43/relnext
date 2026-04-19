# @mash43/relnext

English | [日本語](README.ja.md)

[![npm version](https://img.shields.io/npm/v/@mash43/relnext.svg)](https://www.npmjs.com/package/@mash43/relnext) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

`@mash43/relnext` is a TypeScript library designed to detect pagination links such as "next" and "previous" from web page HTML content or URLs. It supports both traditional `<a>` links and modern SPA buttons (elements without `href`) by providing CSS selectors.

## Features

- **Diverse Detection Methods**: Combines multiple strategies to detect links, including `rel="next"` attribute, text content (e.g., "Next"), CSS class names, and `aria-label` attributes.
- **Selector Support**: Returns CSS selectors for identified elements, allowing you to interact with buttons that don't have an `href` attribute (ideal for Playwright/Puppeteer).
- **URL Pattern Inference**: Infers the URL of the next or previous page from query parameters like `page=2` or path segments like `/page/2`.
- **HTML Fetching Capability**: Includes built-in helper functions to directly fetch HTML content from a specified URL.
- **Flexible Configuration**: Allows customization of behavior, such as changing the order of search methods and setting timeouts.

## Installation

You can install it using npm.

```bash
npm install @mash43/relnext
```

## Usage

### Finding the next page navigation

`findNext` returns a `NavigationResult` object containing the URL (if available), a CSS selector, and the method used for detection.

```typescript
import { findNext } from "@mash43/relnext";

const baseUrl = "https://example.com";
const html = `
  <div class="pagination">
    <a href="/page/2" class="btn-next">Next Page</a>
  </div>
`;

const result = findNext(html, baseUrl);

if (result) {
  console.log(`URL: ${result.url}`);       // https://example.com/page/2
  console.log(`Selector: ${result.selector}`); // a.btn-next
  console.log(`Method: ${result.method}`);     // text
}
```

### Handling elements without `href` (SPA / Client-side Buttons)

`rel="next"` or "Next" text might be on an element without an `href` attribute, such as a `<button>` or an `<a>` tag controlled by JavaScript. In such cases, `result.url` will be `null`, but you can use `result.selector` to find and click the element directly in the browser.

```typescript
const html = `<button id="next-page-btn">Next Page</button>`;
const result = findNext(html, "https://example.com");

if (result) {
  // result.url is null, but result.selector is "#next-page-btn"
  const selector = result.selector;

  // Example: Clicking the button in a browser environment
  document.querySelector(selector)?.click();
}
```

### Just getting the URL

If you only need the URL string, use `findNextURL`. This function continues searching if a matched element does not have a valid `href` (e.g., a decorative label or a disabled button) until it finds the first element that provides a valid URL.

```typescript
import { findNextURL } from "@mash43/relnext";

const url = findNextURL(html, baseUrl);
```

### Inferring the next page from URL patterns

```typescript
import { findNextByUrl } from "@mash43/relnext";

const currentUrl = "https://example.com/articles?page=3";
const nextUrl = await findNextByUrl(currentUrl);

if (nextUrl) {
	console.log(`URL of the next page: ${nextUrl}`);
	// Example output: URL of the next page: https://example.com/articles?page=4
}
```

## API

#### `findNext(html, baseUrl, options?)`

Finds the "next" navigation element and returns a `NavigationResult` object.

- `html`: (string) The HTML content to parse.
- `baseUrl`: (string) The base URL to resolve relative URLs.
- `options`: (FindNextOptions) Search options.

#### `findNextURL(html, baseUrl, options?)`

Finds the URL of the "next" page from an HTML string.

#### `findNextSelector(html, options?)`

Finds the CSS selector of the "next" navigation element. Unlike `findNextURL`, this returns the selector for the **first** element that matches the search criteria (e.g., a `<span>` or `<button>`), regardless of whether it has an `href` attribute.

#### `findPrev(html, baseUrl, options?)` / `findPrevURL(...)` / `findPrevSelector(...)`

Same as above, but for the "previous" page.

#### `findNextByUrl(url, options?)`

Analyzes URL query parameters (e.g., `?page=2`) and path segments (e.g., `/page/2`) to infer the URL of the "next" page.

This function is **asynchronous** because it performs a network request (`HEAD`) to verify that the inferred URL actually exists.

- `url`: (string) The URL of the current page.
- `options`: (BaseOptions) Options.

#### `fetchHtml(url, options?)`

Asynchronously fetches HTML content from the specified URL.

- `url`: (string) The URL to fetch from.
- `options`: (BaseOptions) Options.

---

### Types

##### `NavigationResult`

| Property   | Type      | Description                                           |
| ---------- | --------- | ----------------------------------------------------- |
| `url`      | `string \| null` | The absolute URL of the link. `null` if no `href` exists. |
| `selector` | `string`  | A CSS selector to identify the element.               |
| `method`   | `Method`  | The strategy method that found the element.           |

##### `BaseOptions`

| Property   | Type                       | Description                                                                    |
| ---------- | -------------------------- | ------------------------------------------------------------------------------ |
| `logger`   | `(level, message) => void` | A logger function for recording internal warnings and errors.                  |
| `timeout`  | `number`                   | Timeout in milliseconds for `fetchHtml` and URL existence checks. Default is `8000`. |
| `verifyExists` | `boolean` | Controls whether `findNextByUrl` performs a HEAD request to verify the existence of inferred URLs. Defaults to `true`. |

##### `FindNextOptions`

| Property         | Type               | Description                                                                                                                               |
| ---------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `methods`        | `Method[]`         | An array and order of strategies to use for searching. Default is `["rel", "pagination", "text", "className", "aria-label", "alt"]`. |
| `classNameRegex` | `RegExp`           | Custom regular expression to use when searching for links with the `className` method.                                                    |

##### `Method` Type

`"rel" | "pagination" | "text" | "className" | "aria-label" | "alt"`

## Search Strategies

`findNext` and `findPrev` search for links in the following order by default.

1.  **`rel`**: Searches for `<link rel="next" href="...">` or `<a rel="next">`.
2.  **`pagination`**: Searches for links adjacent to pagination components (`<li>` or `<span>`) with `.current` or `.active` classes.
3.  **`text`**: Searches for tags with text content such as "Next", or ">".
4.  **`className`**: Searches for tags with class names or IDs like `next`.
5.  **`aria-label`**: Searches for tags with `aria-label` attributes like "Next".
6.  **`alt`**: Searches for tags containing images with `alt` attributes including "Next".

## License

[MIT](./LICENSE)
