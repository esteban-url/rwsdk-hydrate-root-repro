# rwsdk `#hydrate-root` corruption repro

A `<style>` comment containing plain-English tag-like text (`<html>`) corrupts
`rwsdk`'s SSR output and breaks client hydration — 100% deterministic, no
timing/network dependency. Confirmed on `rwsdk@1.7.2`.

## Root cause

[`splitStreamOnFirstNonHoistedTag`](https://github.com/redwoodjs/sdk/blob/v1.7.2/sdk/src/runtime/lib/stitchDocumentAndAppStreams.ts#L19-L25)
finds where hoistable tags (`title|meta|link|style|base`) end using a plain
regex over rendered text, with no HTML-parsing context:

```js
/<(?!(?:\/)?(?:title|meta|link|style|base)[\s>\/])(?![!?])/i
```

It doesn't know `<style>`/`<title>` content is RAWTEXT — a browser never
treats `<` inside them as a tag start until the matching close tag. The only
change from a stock `create-rwsdk` starter is this, in
[`src/app/pages/home.tsx`](./src/app/pages/home.tsx):

```jsx
<style href="repro-style" precedence="component">{`
  /* mirrors the <html> element's data-scheme attribute */
  :root { --repro-color: royalblue; }
`}</style>
```

The literal `<html>` — just prose — matches the regex as a false tag
boundary. The stitcher splits the stream mid-comment and misroutes the real
`</head><body>...<div id="hydrate-root">` markup into the still-open
`<style>` tag's text content, where browsers parse it as inert CDATA instead
of DOM:

```html
<style data-precedence="component" data-href="repro-style">
  /* mirrors the </head><body><script>...__RWSDK_CONTEXT...</script><div id="hydrate-root"><html> element's data-scheme attribute */
  :root { --repro-color: royalblue; }
</style><main>...
```

Depending on client-bootstrap order, this throws one of:

```
RedwoodSDK: No element with id "hydrate-root" found in the document...
```
```
TypeError: Cannot read properties of undefined (reading 'u')
```

(The second happens because the same corrupted fragment also swallows the
`__webpack_require__` setup script sitting right before the div — so a later
chunk-URL resolution call hits `undefined.u()` before hydration even checks
for the div.)

## Reproducing

```shell
pnpm install
pnpm dev
```

Open the printed URL and check the console, or confirm directly:

```shell
curl -s http://localhost:5173/ | grep -o 'repro-style.\{0,120\}'
```

`<div id="hydrate-root">` should appear nested inside the `repro-style`
`<style>` tag's text, not as top-level body markup.

## Fix

App-level: reword the comment to avoid a literal `<tagname` sequence. See
[`proposed-fix.patch`](./proposed-fix.patch) for a proposed upstream patch —
and its header for why it closes this report but not the full bug class
(quoted attribute values have the same gap, e.g. `<meta content="<div>" />`).
