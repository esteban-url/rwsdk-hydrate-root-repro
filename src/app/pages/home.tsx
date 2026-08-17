export const Home = () => {
  return (
    <main>
      {/* Repro trigger — see README.md "Root cause". Delete the "<html>"
          below (or reword it) and the page hydrates normally. */}
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
