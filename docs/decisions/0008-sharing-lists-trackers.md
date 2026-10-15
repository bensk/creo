# 0008 — Sharing lists and trackers

**Status:** accepted (Ben, October 15, 2026)

## Decisions

- **One `shares` table** for lists, trackers, and later dashboards: the item (kind and id), a person (`user_id`) or a Google Group, and view or edit. Who shared it is `created_by`. Every share and unshare is audited.
- **Who can open an item:** its owner; anyone it's shared with, directly or through a Google Group; and, read-only, roles with the kind's oversight permission (`cohorts.view_all_lists`, `trackers.view_all`: admin and leader). Everyone else gets a 404, so even an item's existence isn't disclosed.
- **Sensitivity decides who can receive it.** An item's sensitivity is the highest of the fields its population filter uses (and, for trackers, its columns). A share only reaches people whose role sees that level for *every* student. A teacher sees sensitive fields only for students they work with, so a list built from "has an IEP" can't be shared with a teacher. This is checked when sharing (the dialog says why) and again every time the item is opened, so a person who joins a shared Google Group later is held to the same rule.
- **Dynamic lists run as the viewer.** A list's filter is evaluated with the opener's own permissions, so it never shows more than their role allows. The owner can't save a filter their role can't use.
- **Google Group membership** is read by the nightly Directory sync for groups the SIS needs (role mappings and share targets) and stored in `directory_group_members`, a cache replaced on each sync. A new group share reaches its members after the next sync.
- **Anyone can make lists and trackers** (`cohorts.create_lists`, `trackers.create` for every staff role). They are private until shared.
- **Modules stay separate.** The student grid doesn't import the lists feature: the page passes "save as list" in. Rosters on group, class, and list pages get names from the students module's `rosterFor`.
