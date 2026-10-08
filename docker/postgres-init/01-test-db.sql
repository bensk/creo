-- Separate database for Vitest so tests never touch dev data.
CREATE DATABASE creo_test OWNER creo;

-- The app connects as creo_app (no table ownership, no UPDATE/DELETE on audit
-- tables). Migrations run as the owner, creo. Local-only password.
CREATE ROLE creo_app LOGIN PASSWORD 'creo_app';
