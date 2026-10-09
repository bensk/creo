import { defineModule } from "@/core/modules/define";
import * as schema from "./schema";

export const manifest = defineModule({
  id: "integrations",
  schema,
  permissions: [{ key: "integrations.run_imports", description: "Run imports and see their results" }],
});
