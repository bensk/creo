import { defineModule } from "@/core/modules/define";
import * as schema from "./schema";

export const manifest = defineModule({
  id: "slack",
  schema,
  permissions: [{ key: "slack.manage", description: "Connect Slack and choose where notifications go" }],
});
