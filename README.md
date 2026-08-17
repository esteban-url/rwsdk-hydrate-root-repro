# rwsdk `#hydrate-root` corruption repro

Minimal repro for a bug in `rwsdk`'s SSR stream stitcher: a code comment
inside a `<style>` block that happens to contain a bare `<html>` (as prose,
not markup) corrupts the entire SSR response, and client hydration fails.

100% deterministic — no timing, network, or browser dependency. Confirmed
against `rwsdk@1.7.2`.

### Two observed failure modes — same root cause

Which error you see depends only on the incidental order of operations
inside `rwsdk/client`'s `initClient()`, not on anything environment-specific:

**A) The hydrate-root check runs first:**

```
RedwoodSDK: No element with id "hydrate-root" found in the document. This
element is required for hydration. Ensure your Document component contains
a {children}.
```

**B) A client-reference chunk needs resolving first:**

```
Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'u')
```

This second one happens because the SAME corrupted fragment that swallows
`<div id="hydrate-root">` also swallows the inline script immediately
before it:

```html
<script nonce="...">
  globalThis.__RWSDK_CONTEXT = {"rw":{"ssr":true}};
  if (!globalThis.__webpack_require__) {
    globalThis.__webpack_require__ = function (id) { throw new Error(...) };
    globalThis.__webpack_require__.u = function () {};
  }
</script><div id="hydrate-root">...
```

Both the `__RWSDK_CONTEXT` script and the `hydrate-root` div land as inert
text inside the `<style>` tag (see below), so neither becomes a real
DOM/script element. `globalThis.__webpack_require__` is therefore never
assigned its fallback stub. When `client.tsx`'s RSC payload deserializer
(`createFromReadableStream`, via `react-server-dom-webpack`) needs to
resolve a chunk URL for a client reference, it calls
`__webpack_require__.u(...)` on `undefined` — hence "Cannot read properties
of undefined (reading 'u')". This can throw *before* execution ever reaches
the `getElementById("hydrate-root")` check, depending on whether the page's
RSC payload has a client reference to resolve at that point.

Both failure modes are downstream of the exact same stream corruption —
they just surface at different points in the same client bootstrap
sequence.

## Root cause

`splitStreamOnFirstNonHoistedTag` in
`node_modules/rwsdk/dist/runtime/lib/stitchDocumentAndAppStreams.js` finds
the boundary between hoistable tags (`title|meta|link|style|base`) and real
body content using a plain regex over the *rendered text* of the app
stream:

```js
const nonHoistedTagPattern =
  /<(?!(?:\/)?(?:title|meta|link|style|base)[\s>\/])(?![!?])/i;
```

This has no HTML-parsing context — it doesn't know that content inside an
already-open `<style>` (or `<script>`) tag is raw text, not markup. The only
change from a stock `create-rwsdk` starter is one `<style>` block
(`src/app/pages/home.tsx`) whose CSS comment says:

```js
<style href="repro-style" precedence="component">{`
  /* mirrors the <html> element's data-scheme attribute */
  :root { --repro-color: royalblue; }
`}</style>
```

The literal `<html>` inside that comment (just prose, referring to the
`<html>` element) matches the regex above as a false tag boundary. The
stitcher splits the stream mid-comment and misroutes the real
`</head><body>...<div id="hydrate-root">` markup into the still-open
`<style>` tag's text content — where browsers correctly parse it as
CDATA-like raw text instead of DOM. `#hydrate-root` is therefore never
actually parsed into the document, and `initClient()`'s
`document.getElementById("hydrate-root")` check fails.

Confirmed via `curl` against the dev server — note `<div id="hydrate-root">`
landing *inside* the `repro-style` `<style>` tag's comment, followed by the
real page content, followed by the orphaned `</style>` close tag:

```html
<style data-precedence="component" data-href="repro-style">
  /* mirrors the </head><body><script nonce="...">globalThis.__RWSDK_CONTEXT = ...</script><div id="hydrate-root"><html> element's data-scheme attribute */
  :root {
    --repro-color: royalblue;
  }
</style><main><h1 style="color:var(--repro-color)">rwsdk hydrate-root repro</h1>...
```

## Reproducing

```shell
pnpm install
pnpm dev
```

Open the printed localhost URL and check the browser console — you'll see
the `hydrate-root` error. Or fetch the raw HTML directly and confirm
`<div id="hydrate-root">` is nested inside the `repro-style` `<style>` tag's
text rather than appearing as top-level body markup:

```shell
curl -s http://localhost:5173/ | grep -o 'repro-style.\{0,120\}'
```

## Fix

Reword the comment to avoid a literal `<tagname` sequence (e.g. "the html
element" instead of `<html>`) — the page hydrates normally. See
`src/app/pages/home.tsx`.

The durable fix belongs in `rwsdk` itself: `splitStreamOnFirstNonHoistedTag`
needs to be parse-aware — at minimum, tracking `<style>`/`<script>`
open/close state and skipping their raw-text contents — rather than
pattern-matching `<` characters anywhere in the byte stream.
