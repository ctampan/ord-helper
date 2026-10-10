import type { Data } from "./combination";
import { createGameCatalog } from "./data";

// Adding public/data/<version>.json is enough to expose a new version on build.
export const bundledCatalog = createGameCatalog(
  import.meta.glob<Data>("../../public/data/*.json", {
    eager: true,
    import: "default",
  }),
);
