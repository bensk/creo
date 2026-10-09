// Every AI feature has a key here. Grants can be scoped to these keys; a grant
// with no features covers all of them.
export const AI_FEATURES = ["trackers.suggest", "dashboards.widget", "lists.suggest", "family.draft", "students.summary", "slack.ask"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];
