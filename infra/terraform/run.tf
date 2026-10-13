# ── Identities. Each runtime gets its own service account with only what it needs.
resource "google_service_account" "app" {
  account_id   = "creo-sis-app"
  display_name = "Creo SIS app (Cloud Run service)"
}

resource "google_service_account" "jobs" {
  account_id   = "creo-sis-jobs"
  display_name = "Creo SIS jobs (migrations, Directory sync)"
}

resource "google_service_account" "scheduler" {
  account_id   = "creo-sis-scheduler"
  display_name = "Creo SIS scheduler (starts nightly jobs)"
}

resource "google_service_account" "directory" {
  account_id   = "creo-sis-directory"
  display_name = "Creo SIS Directory reader (domain-wide delegation, read-only scopes)"
}

locals {
  app_secrets  = ["database-url-app", "google-client-secret", "anthropic-api-key"]
  jobs_secrets = ["database-url-app", "database-url-migrate", "directory-credentials", "notion-token"]
  # Real student data is imported into production only; staging holds synthetic data.
  bdt_import_enabled     = var.notion_bdt_data_source_id != "" && local.is_production
  google_sign_in_enabled = var.google_client_id != ""
  directory_enabled      = var.directory_admin_email != ""
}

resource "google_secret_manager_secret_iam_member" "app" {
  for_each  = toset(local.app_secrets)
  secret_id = google_secret_manager_secret.secrets[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"
}

resource "google_secret_manager_secret_iam_member" "jobs" {
  for_each  = toset(local.jobs_secrets)
  secret_id = google_secret_manager_secret.secrets[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.jobs.email}"
}

resource "google_storage_bucket_iam_member" "app_files" {
  bucket = google_storage_bucket.files.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.app.email}"
}

# ── The app.
resource "google_cloud_run_v2_service" "app" {
  name                = "creo-sis-app"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = local.is_production
  labels              = local.labels

  template {
    service_account                  = google_service_account.app.email
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = var.app_min_instances
      max_instance_count = var.app_max_instances
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.app.id
      }
    }

    containers {
      image = var.app_image
      ports {
        container_port = 8080
      }
      resources {
        limits            = { cpu = "1", memory = "1Gi" }
        cpu_idle          = !local.is_production
        startup_cpu_boost = true
      }

      env {
        name  = "APP_URL"
        value = var.app_url
      }
      env {
        name  = "WORKSPACE_DOMAIN"
        value = var.workspace_domain
      }
      env {
        name  = "FILES_BUCKET"
        value = google_storage_bucket.files.name
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["database-url-app"].secret_id
            version = "latest"
          }
        }
      }
      dynamic "env" {
        for_each = local.google_sign_in_enabled ? [1] : []
        content {
          name  = "GOOGLE_CLIENT_ID"
          value = var.google_client_id
        }
      }
      dynamic "env" {
        for_each = local.google_sign_in_enabled ? [1] : []
        content {
          name = "GOOGLE_CLIENT_SECRET"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["google-client-secret"].secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/api/health"
        }
        initial_delay_seconds = 2
        period_seconds        = 3
        failure_threshold     = 20
      }
      liveness_probe {
        http_get {
          path = "/api/health"
        }
        period_seconds = 30
      }
    }
  }

  lifecycle {
    # Deploys change the image (.github/workflows/deploy.yml).
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_secret_manager_secret_iam_member.app, google_secret_manager_secret_version.database_url_app]
}

# The app is a public website; access control happens inside it (Google sign-in, sessions, permissions).
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Jobs, from the tools image: `pnpm db:migrate`, `pnpm directory:sync`.
resource "google_cloud_run_v2_job" "migrate" {
  name                = "creo-sis-migrate"
  location            = var.region
  deletion_protection = local.is_production
  labels              = local.labels

  template {
    task_count = 1
    template {
      service_account = google_service_account.jobs.email
      max_retries     = 0
      timeout         = "600s"
      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.vpc.id
          subnetwork = google_compute_subnetwork.app.id
        }
      }
      containers {
        image = var.app_image
        args  = ["db:migrate"]
        env {
          name = "MIGRATION_DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["database-url-migrate"].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_iam_member.jobs, google_secret_manager_secret_version.database_url_migrate]
}

resource "google_cloud_run_v2_job" "directory_sync" {
  count               = local.directory_enabled ? 1 : 0
  name                = "creo-sis-directory-sync"
  location            = var.region
  deletion_protection = local.is_production
  labels              = local.labels

  template {
    task_count = 1
    template {
      service_account = google_service_account.jobs.email
      max_retries     = 1
      timeout         = "900s"
      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.vpc.id
          subnetwork = google_compute_subnetwork.app.id
        }
      }
      containers {
        image = var.app_image
        args  = ["directory:sync"]
        env {
          name  = "GOOGLE_DIRECTORY_ADMIN"
          value = var.directory_admin_email
        }
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["database-url-app"].secret_id
              version = "latest"
            }
          }
        }
        env {
          name = "GOOGLE_DIRECTORY_CREDENTIALS"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["directory-credentials"].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_iam_member.jobs]
}

resource "google_cloud_run_v2_job_iam_member" "scheduler_runs_sync" {
  count    = local.directory_enabled ? 1 : 0
  name     = google_cloud_run_v2_job.directory_sync[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

# Nightly at 2:30 a.m. New York time.
resource "google_cloud_scheduler_job" "directory_sync" {
  count     = local.directory_enabled ? 1 : 0
  name      = "creo-sis-directory-sync-nightly"
  region    = var.region
  schedule  = "30 2 * * *"
  time_zone = "America/New_York"

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.directory_sync[0].name}:run"
    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }
}

# ── Deploys from GitHub Actions through Workload Identity Federation (no keys).
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.services]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  # Only this repository may authenticate.
  attribute_condition = "assertion.repository == \"${var.github_repository}\""
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = "creo-sis-deployer"
  display_name = "Creo SIS deployer (GitHub Actions)"
}

resource "google_service_account_iam_member" "github_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_project_iam_member" "deployer" {
  for_each = toset(["roles/run.developer", "roles/artifactregistry.writer"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

# The deployer deploys revisions that run as the app and jobs service accounts.
resource "google_service_account_iam_member" "deployer_acts_as" {
  for_each           = { app = google_service_account.app.name, jobs = google_service_account.jobs.name }
  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# ── Nightly Big Data Tracker import (Notion → students, homerooms, contacts, IEP/504), production only.
resource "google_cloud_run_v2_job" "bdt_import" {
  count               = local.bdt_import_enabled ? 1 : 0
  name                = "creo-sis-bdt-import"
  location            = var.region
  deletion_protection = true
  labels              = local.labels

  template {
    task_count = 1
    template {
      service_account = google_service_account.jobs.email
      max_retries     = 1
      timeout         = "900s"
      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.vpc.id
          subnetwork = google_compute_subnetwork.app.id
        }
      }
      containers {
        image = var.app_image
        args  = ["import:bdt"]
        env {
          name  = "NOTION_BDT_DATA_SOURCE_ID"
          value = var.notion_bdt_data_source_id
        }
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["database-url-app"].secret_id
              version = "latest"
            }
          }
        }
        env {
          name = "NOTION_TOKEN"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["notion-token"].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_iam_member.jobs]
}

resource "google_cloud_run_v2_job_iam_member" "scheduler_runs_bdt_import" {
  count    = local.bdt_import_enabled ? 1 : 0
  name     = google_cloud_run_v2_job.bdt_import[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

# Nightly at 2:45 a.m. New York time, after Directory sync.
resource "google_cloud_scheduler_job" "bdt_import" {
  count     = local.bdt_import_enabled ? 1 : 0
  name      = "creo-sis-bdt-import-nightly"
  region    = var.region
  schedule  = "45 2 * * *"
  time_zone = "America/New_York"

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.bdt_import[0].name}:run"
    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }
}
