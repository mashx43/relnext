export const REGEX = {
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
	POTENTIAL_LINK_TAGS: /<(?<tagName>a|link)\s+(?<attributes>[^>]*?)>/gi,
	ANCHOR_TAG: /<(?<tagName>a)\s+(?<attributes>[^>]+)>(?<innerText>.*?)<\/a>/gis,
	ANCHOR_TAG_START: /<(?<tagName>a)\s+(?<attributes>[^>]+)>/gi,
	PAGINATION_CONTAINER:
		/<(?<tagName>div|nav|ul)[^>]+(?:class|id)\s*=\s*['"][^'"]*(?:pagination|pager|page-nav)[^'"]*['"][^>]*>(?<containerHtml>[\s\S]*?)<\/(?:div|nav|ul)>/gi,
	ARTICLE_EXCLUDE: /<(?:p|article)[^>]*?>[\s\S]*?<\/(?:p|article)>/gi,
	IMG_TAG: /<img[^>]+>/gi,
	PATH_PAGE_NUMBER: /^(.*[/\-_])(\d+)$/,
	HTML_TAGS: /<[^>]+>/g,
	HTML_ENTITIES: /&[a-z]+;|&#[0-9]+;|&#x[0-9a-f]+;/gi,
};

export const DEFAULT_TIMEOUT_MS = 8000;
