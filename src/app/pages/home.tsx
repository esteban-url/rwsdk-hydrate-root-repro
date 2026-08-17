export const Home = () => {
  return (
    <main>
      {/*
       * Minimal repro for: rwsdk's SSR stream stitcher
       * (splitStreamOnFirstNonHoistedTag in
       * src/runtime/lib/stitchDocumentAndAppStreams.ts) scans hoisted-tag
       * output with a plain regex that has no concept of <style>/<script>
       * content being raw text. The regex is:
       *
       *   /<(?!(?:\/)?(?:title|meta|link|style|base)[\s>\/])(?![!?])/i
       *
       * A literal "<html>" appearing as PROSE inside this comment (not real
       * markup — just describing the html element) matches that pattern.
       * The stitcher treats it as a real tag boundary, splitting the SSR
       * stream mid-comment and misrouting the Document's own
       * `<div id="hydrate-root">` markup into this still-open <style> tag's
       * text content. Browsers correctly parse that as CDATA-like raw text,
       * so #hydrate-root is never actually parsed into the DOM.
       *
       * Result: rwsdk/client's initClient() throws
       *   RedwoodSDK: No element with id "hydrate-root" found in the
       *   document. This element is required for hydration. Ensure your
       *   Document component contains a {children}.
       * on every single page load — 100% deterministic, no timing/network
       * dependency. Delete the "<html>" below (e.g. reword to "the html
       * element") and the page hydrates normally.
       */}
      <style href="repro-style" precedence="component">{`
        /* mirrors the <html> element's data-scheme attribute */
        :root {
          --repro-color: royalblue;
        }
      `}</style>
      <h1 style={{ color: "var(--repro-color)" }}>rwsdk hydrate-root repro</h1>
      <p>
        Open the browser console. If the bug reproduces, you'll see:{" "}
        <code>
          RedwoodSDK: No element with id "hydrate-root" found in the
          document.
        </code>
      </p>
    </main>
  );
};
