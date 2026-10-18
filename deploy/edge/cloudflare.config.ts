// e-acc.ai edge Worker (deploy/README.md). Deploy from this directory: cf deploy --secrets-file <file with EDGE_SECRET>.
import { bindings, defineConfig, triggers } from "cf/config";
import * as entrypoint from "./src/index.mjs" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "eacc-edge",
    compatibilityDate: "2026-09-25",
    entrypoint,
    env: {
      // The news site; it serves only requests carrying EDGE_SECRET and redirects the rest to e-acc.ai.
      NEWS_ORIGIN: bindings.text("https://news.e-accs.com"),
      EDGE_SECRET: bindings.secret(),
    },
    triggers: [triggers.fetch({ pattern: "e-acc.ai/*", zone: "e-acc.ai" })],
  },
});
