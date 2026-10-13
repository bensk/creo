import { defineModule } from "@/core/modules/define";
import * as schema from "./schema";

export const manifest = defineModule({
  id: "slack",
  schema,
  permissions: [
    { key: "slack.manage", description: "Connect Slack and choose where notifications go" },
    { key: "slack.allow_names", description: "Allow student names in a private Slack channel" },
  ],
  notifications: [
    {
      type: "slack.test",
      label: "Test message",
      description: "A message an admin or leader sends from the Slack page to check that a channel or DM works.",
    },
  ],
});
