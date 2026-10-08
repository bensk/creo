# Setting up Google Cloud, Google sign-in, and Directory sync

Everything in the code is ready; these are the steps only a Creo admin can do. Do staging first, then production. Each step says who needs to do it.

## 1. Projects and billing (Google Cloud owner)

1. Create two projects, e.g. `creo-sis-staging` and `creo-sis-production`, in Creo's Google Cloud organization. Link billing.
2. In each, create a bucket for Terraform state: `gcloud storage buckets create gs://<project>-tfstate --location us-east4 --uniform-bucket-level-access`.
3. Put the real project IDs in `infra/terraform/environments/staging.tfvars` and `production.tfvars`.

## 2. Create the infrastructure (Terraform)

From `infra/terraform`, signed in with `gcloud auth application-default login`:

```
terraform init -backend-config="bucket=<project>-tfstate" -backend-config="prefix=creo-sis"
terraform apply -var-file=environments/staging.tfvars
```

This creates the network, the private Cloud SQL database (PostgreSQL 17; high availability in production), secrets, the file bucket, the image registry, the app service, the migration job, and the GitHub deploy identity. Note the outputs.

## 3. Let GitHub deploy (repository admin)

In GitHub → Settings → Environments, create `staging` and `production` (add required reviewers on production). In each, add variables from `terraform output`:

- `GCP_PROJECT_ID`
- `GCP_REGION` = `us-east4`
- `GCP_WORKLOAD_IDENTITY_PROVIDER` = `workload_identity_provider`
- `GCP_DEPLOYER_SERVICE_ACCOUNT` = `deployer_service_account`

The next merge to `main` deploys staging: it builds the images, runs migrations, and deploys the app. Production deploys only from Actions → Deploy → Run workflow → production.

## 4. Google sign-in (Workspace admin + Cloud owner)

1. Google Cloud console → APIs & Services → OAuth consent screen: **Internal**, app name "Creo SIS".
2. Credentials → Create OAuth client ID → Web application. Authorized redirect URI: `<app_url>/api/auth/google/callback` (e.g. `https://sis.creoprep.org/api/auth/google/callback`).
3. Store the secret: `printf '%s' '<client secret>' | gcloud secrets versions add creo-sis-google-client-secret --data-file=-`
4. Set `google_client_id` in the tfvars file and `terraform apply` again. The sign-in pages then show "Sign in with Google".

## 5. Directory sync (Workspace super admin)

1. Create a key for the `creo-sis-directory` service account and store it, then delete the local copy:
   `gcloud iam service-accounts keys create key.json --iam-account creo-sis-directory@<project>.iam.gserviceaccount.com`
   `gcloud secrets versions add creo-sis-directory-credentials --data-file=key.json && rm key.json`
2. Workspace admin console → Security → API controls → Domain-wide delegation → Add new. Client ID: `directory_service_account_client_id` from `terraform output`. Scopes (read-only):
   `https://www.googleapis.com/auth/admin.directory.user.readonly,https://www.googleapis.com/auth/admin.directory.group.member.readonly`
3. Set `directory_admin_email` (a Workspace admin the service account acts as) in the tfvars file and `terraform apply`. This adds the nightly sync (2:30 a.m.) and enables student sign-in checks.
4. Tell us which Google Groups map to which roles; they go in `role_group_mappings`.

## 6. Staging data and the load test

Staging only ever holds synthetic data. With the Cloud SQL Auth Proxy running locally:

```
SEED_STAGING_CONFIRM=creo_staging MIGRATION_DATABASE_URL=postgres://creo:<pw>@localhost:5432/creo_staging pnpm db:seed
DATABASE_URL=postgres://creo_app:<pw>@localhost:5432/creo_staging pnpm load:sessions --out data/load-sessions.json
docker run --rm -v "$PWD:/w" -w /w grafana/k6:1.4.2 run -e BASE_URL=<staging url> -e SESSIONS=/w/data/load-sessions.json tests/load/homeroom-burst.js
```

Seeding and load sessions refuse the production database (`creo`) no matter how it's reached.
