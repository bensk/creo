-- citext: case-insensitive emails. btree_gist: no-overlap (exclusion) constraints
-- on effective-dated rows. Both are trusted extensions available on Cloud SQL.
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
