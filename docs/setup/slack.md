# Connecting Slack

The SIS works fully without Slack. Connecting it adds `/student` lookups, link previews for SIS URLs, and notifications whose destinations are set on the Slack page in the staff app.

## 1. Create the app (Slack workspace admin)

1. Go to https://api.slack.com/apps → **Create New App** → **From an app manifest**, and choose the Creo workspace.
2. Paste `infra/slack/manifest.yaml`. Replace `sis.creoprep.org` with the app's real host (staging and production each get their own Slack app).
3. **Install to Workspace** and approve the scopes.

## 2. Store the secrets

From the app's settings:

| Value | Where in Slack | Where it goes |
|---|---|---|
| Signing secret | Basic Information → App Credentials | Secret Manager: `creo-sis-<env>-slack-signing-secret` |
| Bot token (`xoxb-…`) | OAuth & Permissions | Secret Manager: `creo-sis-<env>-slack-bot-token` |
| Workspace ID (`T…`) | Workspace settings, or the URL of the Slack web app | Terraform variable `slack_team_id` |

```
printf '%s' 'SIGNING_SECRET' | gcloud secrets versions add creo-sis-production-slack-signing-secret --data-file=-
printf '%s' 'xoxb-…'         | gcloud secrets versions add creo-sis-production-slack-bot-token --data-file=-
```

Then set `slack_team_id` in the environment's `.tfvars` and apply. Until it is set, the Slack endpoints answer 404.

For local development, put `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, and `SLACK_TEAM_ID` in `.env.local` and expose port 3000 with a tunnel; use a separate development Slack app.

## 3. Check it

- In Slack, type `/student` and a name. Only you see the answer.
- The first time someone uses the app, the SIS links their Slack account to their staff record by their confirmed Workspace email. Anyone without a match gets a short message and nothing else.
- In the SIS, open **Slack** (admins and leaders). The page says which workspace is connected. Add a rule, invite the app to the channel (`/invite @Creo SIS`), and press **Send test**.

## Privacy

- Lookups are ephemeral and show only standard fields: preferred name, pronunciation, grade, homeroom, and a link.
- Link previews show the kind of page and its title. A student profile link shows "Student profile", without the name.
- Channel posts default to counts. Names need a private channel that an admin has approved on the Slack page; if the channel later becomes public, posts drop to initials.
- Sensitive fields never go to Slack. Every message the SIS sends is logged in `slack_messages`.
