# TraceForge

Turn system failures into explainable investigations. TraceForge is a local-first incident investigation workspace built with Next.js, React, TypeScript, React Flow, Dexie, Zod, and Papa Parse.

## Start

```bash
npm ci
npm run dev
```

Open http://localhost:3000. No account, API key, or backend database is needed. `npm run typecheck`, `npm test`, and `npm run build` verify the project.

## Investigate

1. Open one of three clearly labeled synthetic scenarios, or import JSON, JSONL, or CSV (up to 10 MB).
2. Preview input and map CSV columns. Invalid rows receive explicit errors; valid records remain available.
3. Replay the timeline, search and filter events, and inspect the explicit evidence graph.
4. Save annotations and findings. Run deterministic local rules for evidence-backed observations.
5. Export Markdown or JSON. Print the report page to PDF.

The event pipeline is `import → validate/normalize → IndexedDB → filter/correlate → timeline/graph → findings → report`. Domain functions live in `src/lib/core.ts`; sample incidents and storage live in `src/lib/data.ts`; the investigation UI lives in `src/components/workspace.tsx`.

## Privacy and limits

Imported telemetry is read in the browser. Investigations and notes live in IndexedDB on the current device; they do not synchronize between devices. No external AI integration or telemetry service is configured. Graph edges use explicit service ownership, parent span, or matching request IDs. A shared ID indicates a relationship, not a proven cause. The initial implementation targets modest datasets; the import file limit is 10 MB. Clear local investigations in Settings.

## License

MIT. See [LICENSE](LICENSE).
