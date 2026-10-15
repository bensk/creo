import { defineModule } from "@/core/modules/define";
import * as schema from "./schema";

export const manifest = defineModule({
  id: "trackers",
  schema,
  permissions: [
    { key: "trackers.create", description: "Create trackers and tracker templates" },
    { key: "trackers.view_all", description: "See every tracker, shared or not (oversight)" },
  ],
});
