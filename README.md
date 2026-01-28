# @mash43/relnext

[![npm version](https://img.shields.io/npm/v/@mash43/relnext.svg)](https://www.npmjs.com/package/@mash43/relnext) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

`@mash43/relnext` is a TypeScript library designed to detect pagination links such as "next" and "previous" from web page HTML content or URLs.

## Features

- **Diverse Detection Methods**: Combines multiple strategies to detect links, including `rel="next"` attribute, text content (e.g., "Next"), CSS class names, and `aria-label` attributes.
- **URL Pattern Inference**: Infers the URL of the next or previous page from query parameters like `page=2` or path segments like `/page/2`.
- **HTML Fetching Capability**: Includes built-in helper functions to directly fetch HTML content from a specified URL.
- **Flexible Configuration**: Allows customization of behavior, such as changing the order of search methods and setting timeouts.

## Installation

You can install it using npm.

```bash
npm install @mash43/relnext
```

## Usage

### Finding the next page from HTML content

```typescript
import { findNext } from "@mash43/relnext";

const baseUrl = "https://example.com";
const html = `
  <html>
    <body>
      <div class="pagination">
        <span>Page 1</span>
        <a href="/page/2">Next</a>
      </div>
    </body>
  </html>
`;

const nextLink = findNext(html, baseUrl);

if (nextLink) {
	console.log(`URL of the next page: ${nextLink}`);
	// Example output: URL of the next page: https://example.com/page/2
} else {
	console.log("Next page not found.");
}
```

### Inferring the next page from URL patterns

```typescript
import { findNextByUrl } from "@mash43/relnext";

const currentUrl = "https://example.com/articles?page=3";
const nextUrl = await findNextByUrl(currentUrl);

if (nextUrl) {
	console.log(`URL of the next page: ${nextUrl}`);
	// Example output: URL of the next page: https://example.com/articles?page=4
} else {
	console.log("Next page not found.");
}
```

## API

#### `findNext(html, baseUrl, options?)`

Finds the URL of the "next" page from an HTML string.

- `html`: (string) The HTML content to parse.
- `baseUrl`: (string) The base URL to resolve relative URLs.
- `options`: (FindNextOptions) Search options.

#### `findPrev(html, baseUrl, options?)`

Finds the URL of the "previous" page from an HTML string.

- `html`: (string) The HTML content to parse.
- `baseUrl`: (string) The base URL to resolve relative URLs.
- `options`: (FindNextOptions) Search options.

#### `findNextByUrl(url, options?)`

Analyzes URL query parameters (e.g., `?page=2`) and path segments (e.g., `/page/2`) to infer the URL of the "next" page.

This function is **asynchronous** because it performs a network request (`HEAD`) to verify that the inferred URL actually exists.

- `url`: (string) The URL of the current page.
- `options`: (BaseOptions) Options. The `timeout` option can be used to set the timeout for the URL existence check.

#### `findPrevByUrl(url, options?)`

Analyzes URL query parameters and paths to infer the URL of the "previous" page.

This function is **asynchronous**. See `findNextByUrl` for details.

- `url`: (string) The URL of the current page.
- `options`: (BaseOptions) Options. The `timeout` option can be used to set the timeout for the URL existence check.

#### `fetchHtml(url, options?)`

Asynchronously fetches HTML content from the specified URL.

- `url`: (string) The URL to fetch from.
- `options`: (BaseOptions) Options.

---

### Options

Options that can be passed to functions like `findNext` and `findPrev`.

##### `BaseOptions`

The base interface for all option objects.

| Property   | Type                       | Description                                                                    |
| ---------- | -------------------------- | ------------------------------------------------------------------------------ |
| `logger`   | `(level, message) => void` | A logger function for recording internal warnings and errors.                  |
| `timeout`  | `number`                   | Timeout in milliseconds for `fetchHtml` and URL existence checks. Default is `8000`. |
| `verifyExists` | `boolean` | Controls whether `findNextByUrl` and `findPrevByUrl` perform a HEAD request to verify the existence of inferred URLs. Setting to `false` skips verification, potentially improving performance, but may return non-existent URLs. Defaults to `true`. |

##### `FindNextOptions`

Inherits from `BaseOptions`.

| Property         | Type               | Description                                                                                                                               |
| ---------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `methods`        | `Method[]`         | An array and order of strategies to use for searching. Default is `["rel", "pagination", "text", "className", "aria-label", "alt"]`. |
| `classNameRegex` | `RegExp`           | Custom regular expression to use when searching for links with the `className` method.                                                    |

##### `Method` Type

`"rel" | "pagination" | "text" | "className" | "aria-label" | "alt"`

## Search Strategies

`findNext` and `findPrev` search for links in the following order by default. This order can be customized with `options.methods`.

1.  **`rel`**: Searches for `<link rel="next" href="...">` or `<a rel="next" href="...">`.
2.  **`pagination`**: Searches for links adjacent to pagination components (`<li>` or `<span>`) with `.current` or `.active` classes.
3.  **`text`**: Searches for anchor tags with text content such as "Next", or ">".
4.  **`className`**: Searches for anchor tags with class names or IDs like `next`.
5.  **`aria-label`**: Searches for anchor tags with `aria-label` attributes like "Next".
6.  **`alt`**: Searches for anchor tags containing images with `alt` attributes including "Next".

## License

[MIT](./LICENSE)
