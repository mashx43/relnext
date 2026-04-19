# @mash43/relnext

[English](README.md) | 日本語

[![npm version](https://img.shields.io/npm/v/@mash43/relnext.svg)](https://www.npmjs.com/package/@mash43/relnext) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

`@mash43/relnext` は、ウェブページのHTMLコンテンツやURLから「次へ」や「前へ」などのページネーションリンクを検出するためのTypeScriptライブラリです。従来の `<a>` リンクだけでなく、CSSセレクタを提供することで、`href` を持たないモダンなSPAのボタンにも対応しています。

## 特徴

- **多様な検出メソッド**: `rel="next"` 属性、テキスト内容（例：「次へ」）、CSSクラス名、`aria-label` 属性など、複数の戦略を組み合わせてリンクを検出します。
- **セレクタのサポート**: 検出された要素のCSSセレクタを返します。これにより、`href` 属性を持たないボタン（PlaywrightやPuppeteer、ブラウザ拡張機能での操作に最適）とのインタラクションが可能です。
- **URLパターンの推論**: `page=2` のようなクエリパラメータや `/page/2` のようなパスセグメントから、次または前のページのURLを推論します。
- **HTML取得機能**: 指定されたURLからHTMLコンテンツを直接取得するためのヘルパー関数が含まれています。
- **柔軟な設定**: 検索メソッドの順序変更やタイムアウトの設定など、動作のカスタマイズが可能です。

## インストール

npmを使用してインストールできます。

```bash
npm install @mash43/relnext
```

## 使い方

### 次のページへのナビゲーションを見つける

`findNext` は、URL（利用可能な場合）、CSSセレクタ、および検出に使用されたメソッドを含む `NavigationResult` オブジェクトを返します。

```typescript
import { findNext } from "@mash43/relnext";

const baseUrl = "https://example.com";
const html = `
  <div class="pagination">
    <a href="/page/2" class="btn-next">次のページ</a>
  </div>
`;

const result = findNext(html, baseUrl);

if (result) {
  console.log(`URL: ${result.url}`);       // https://example.com/page/2
  console.log(`Selector: ${result.selector}`); // a.btn-next
  console.log(`Method: ${result.method}`);     // text
}
```

### `href` を持たない要素の処理 (SPA / クライアントサイドのボタン)

`rel="next"` や「次へ」というテキストを持つ要素が、`href` 属性を持たないボタン（`<button>` や JavaScript で制御された要素）である場合があります。この場合、`result.url` は `null` になりますが、`result.selector` を使ってブラウザ上でその要素を特定し、直接クリック操作を行うことができます。

```typescript
const html = `<button id="next-page-btn">次へ</button>`;
const result = findNext(html, "https://example.com");

if (result) {
  // result.url は null になるが、result.selector ("#next-page-btn") が取得できる
  const selector = result.selector;

  // 例：ブラウザ環境でボタンをクリックする
  document.querySelector(selector)?.click();
}
```

### URLのみを取得する

URL文字列のみが必要な場合は、`findNextURL` を使用します。この関数は、マッチした要素が有効な `href` を持っていない場合（例：装飾用のラベルや無効化されたボタンなど）、さらに検索を続けて有効なURLを持つ最初の要素を返します。

```typescript
import { findNextURL } from "@mash43/relnext";

const url = findNextURL(html, baseUrl);
```

### URLパターンから次のページを推論する

```typescript
import { findNextByUrl } from "@mash43/relnext";

const currentUrl = "https://example.com/articles?page=3";
const nextUrl = await findNextByUrl(currentUrl);

if (nextUrl) {
	console.log(`次のページのURL: ${nextUrl}`);
	// 出力例: 次のページのURL: https://example.com/articles?page=4
}
```

## API

#### `findNext(html, baseUrl, options?)`

「次へ」のナビゲーション要素を検索し、`NavigationResult` オブジェクトを返します。

- `html`: (string) 解析するHTMLコンテンツ。
- `baseUrl`: (string) 相対URLを解決するためのベースURL。
- `options`: (FindNextOptions) 検索オプション。

#### `findNextURL(html, baseUrl, options?)`

HTML文字列から「次へ」のページのURLを検索します。

#### `findNextSelector(html, options?)`

「次へ」のナビゲーション要素のCSSセレクタを検索します。`findNextURL` とは異なり、`href` の有無にかかわらず、戦略にマッチした**最初**の要素（例：`<span>` や `<button>` など）のセレクタを返します。

#### `findPrev(html, baseUrl, options?)` / `findPrevURL(...)` / `findPrevSelector(...)`

上記と同様ですが、「前へ」のページが対象です。

#### `findNextByUrl(url, options?)`

URLのクエリパラメータ（例：`?page=2`）やパスセグメント（例：`/page/2`）を分析して、「次へ」のページのURLを推論します。

この関数は、推論されたURLが実際に存在するかどうかを確認するためにネットワークリクエスト（`HEAD`）を実行するため、**非同期**です。

- `url`: (string) 現在のページのURL。
- `options`: (BaseOptions) オプション。

#### `fetchHtml(url, options?)`

指定されたURLからHTMLコンテンツを非同期で取得します。

- `url`: (string) 取得先のURL。
- `options`: (BaseOptions) オプション。

---

### 型定義 (Types)

##### `NavigationResult`

| プロパティ | 型 | 説明 |
| ---------- | --------- | ----------------------------------------------------- |
| `url`      | `string \| null` | リンクの絶対URL。`href` が存在しない場合は `null`。 |
| `selector` | `string`  | 要素を特定するためのCSSセレクタ。 |
| `method`   | `Method`  | 要素を見つけるために使用された戦略メソッド。 |

##### `BaseOptions`

| プロパティ | 型 | 説明 |
| ---------- | -------------------------- | ------------------------------------------------------------------------------ |
| `logger`   | `(level, message) => void` | 内部の警告やエラーを記録するためのロガー関数。 |
| `timeout`  | `number`                   | `fetchHtml` およびURLの存在確認のタイムアウト（ミリ秒）。デフォルトは `8000`。 |
| `verifyExists` | `boolean` | `findNextByUrl` が推論されたURLの存在を確認するために HEAD リクエストを実行するかどうか。デフォルトは `true`。 |

##### `FindNextOptions`

| プロパティ | 型 | 説明 |
| ---------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `methods`        | `Method[]`         | 検索に使用する戦略の配列と順序。デフォルトは `["rel", "pagination", "text", "className", "aria-label", "alt"]`。 |
| `classNameRegex` | `RegExp`           | `className` メソッドでリンクを検索する際に使用するカスタム正規表現。 |

##### `Method` 型

`"rel" | "pagination" | "text" | "className" | "aria-label" | "alt"`

## 検索戦略 (Search Strategies)

`findNext` と `findPrev` は、デフォルトで以下の順序でリンクを検索します。

1.  **`rel`**: `<link rel="next" href="...">` または `<a rel="next">` を検索します。
2.  **`pagination`**: `.current` または `.active` クラスを持つページネーションコンポーネント（`<li>` または `<span>`）に隣接するリンクを検索します。
3.  **`text`**: "Next" や ">" などのテキストコンテンツを持つタグを検索します。
4.  **`className`**: `next` のようなクラス名やIDを持つタグを検索します。
5.  **`aria-label`**: "Next" のような `aria-label` 属性を持つタグを検索します。
6.  **`alt`**: "Next" を含む `alt` 属性を持つ画像を含むタグを検索します。

## ライセンス

[MIT](./LICENSE)
