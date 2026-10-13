# 0006 — The Slack app

**Status:** accepted, October 2026

## Decisions

- **Bolt inside Next.js route handlers.** `/api/slack/{commands,interactions,events,options}` share one Bolt `App` with a custom receiver (`modules/slack/receiver.ts`) instead of Bolt's own HTTP server, so Slack runs on the same Cloud Run service. The receiver checks the signing secret (Bolt's `isValidSlackRequest`, which also rejects requests older than five minutes) and the workspace ID before Bolt sees anything. It answers as soon as a listener calls `ack()`, or with an empty 200 after 2.5 seconds. Slack's retries are acknowledged and dropped, because the first delivery already ran.
- **One workspace, configured by environment.** `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN` come from Secret Manager, and `SLACK_TEAM_ID` comes from Terraform. Without all three, the endpoints answer 404 and the Slack page says Slack isn't connected. The `slack_installation` table stays unused until we need OAuth installs (more than one workspace).
- **Linking happens on first use.** A Slack user is linked to a staff member when Slack reports a *confirmed* email that matches exactly one active staff record. The link is audited (`via: slack`). After that, roles and status are read fresh on every request, so deactivating someone in the SIS cuts off Slack too.
- **`/student` is audited.** Each lookup writes `slack.student_lookup` with the IDs it showed, because Slack is outside the app's own access logs.
- **Link previews never name a student.** Anyone in the channel sees an unfurl, so `/students/<id>` unfurls as "Student profile". The students list unfurls with an enrolled count.
- **Names in channels need `slack.allow_names`.** That permission is admin only, separate from `slack.manage` (admin and leader). `notify.ts` asks Slack whether the channel is still private on every send that carries names, and drops to initials if not.
- **Notification content has a fixed shape.** It has a headline, a list of student names, and a path. Callers can't attach other fields, so sensitive data can't reach Slack by accident.
- **Notifications are sent inline for now.** pg-boss arrives with the first notification that needs a schedule or a large query. `notify()` keeps its signature, so callers won't change.
- **Test message.** The slack module declares `slack.test`, so admins can check a rule end to end with **Send test**, through the same path every notification uses.
