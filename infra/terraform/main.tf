locals {
  name          = "creo-sis"
  is_production = var.environment == "production"
  # Staging's database name ends in _staging; seed and reset tools refuse any other remote database.
  database_name = local.is_production ? "creo" : "creo_staging"
  labels        = { app = local.name, environment = var.environment }
}

resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com", "sqladmin.googleapis.com", "secretmanager.googleapis.com", "artifactregistry.googleapis.com",
    "compute.googleapis.com", "servicenetworking.googleapis.com", "cloudscheduler.googleapis.com",
    "iamcredentials.googleapis.com", "iam.googleapis.com", "sts.googleapis.com", "admin.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

# ── Network: the database has only a private IP; Cloud Run reaches it through direct VPC egress.
resource "google_compute_network" "vpc" {
  name                    = local.name
  auto_create_subnetworks = false
  depends_on              = [google_project_service.services]
}

resource "google_compute_subnetwork" "app" {
  name                     = "${local.name}-app"
  network                  = google_compute_network.vpc.id
  region                   = var.region
  ip_cidr_range            = "10.10.0.0/24"
  private_ip_google_access = true
}

resource "google_compute_global_address" "private_services" {
  name          = "${local.name}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

# ── Database: Cloud SQL for PostgreSQL 17, high availability in production, PITR, daily backups.
resource "google_sql_database_instance" "db" {
  name                = "${local.name}-${var.environment}"
  database_version    = "POSTGRES_17"
  region              = var.region
  deletion_protection = true
  depends_on          = [google_service_networking_connection.private_services]

  settings {
    tier              = var.db_tier
    edition           = "ENTERPRISE"
    availability_type = local.is_production ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true
    user_labels       = local.labels

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "07:00" # 3 a.m. New York
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = local.is_production ? 30 : 7
      }
    }

    maintenance_window {
      day  = 7 # Sunday
      hour = 8 # 4 a.m. New York
    }

    insights_config {
      query_insights_enabled = true
    }
  }
}

resource "google_sql_database" "app" {
  name     = local.database_name
  instance = google_sql_database_instance.db.name
}

# The owner runs migrations. The app connects as creo_app, which the migrations
# grant table access to and deny UPDATE/DELETE on the audit tables.
resource "random_password" "db_owner" {
  length  = 32
  special = false
}

resource "random_password" "db_app" {
  length  = 32
  special = false
}

resource "google_sql_user" "owner" {
  name     = "creo"
  instance = google_sql_database_instance.db.name
  password = random_password.db_owner.result
}

resource "google_sql_user" "app" {
  name     = "creo_app"
  instance = google_sql_database_instance.db.name
  password = random_password.db_app.result
}

locals {
  db_host        = google_sql_database_instance.db.private_ip_address
  app_db_url     = "postgres://creo_app:${random_password.db_app.result}@${local.db_host}:5432/${local.database_name}?sslmode=require"
  migrate_db_url = "postgres://creo:${random_password.db_owner.result}@${local.db_host}:5432/${local.database_name}?sslmode=require"
}

# ── Secrets. Values Terraform knows are written here; the rest are added by hand
# (gcloud secrets versions add ...) and are only wired up once they exist.
resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(["database-url-app", "database-url-migrate", "google-client-secret", "directory-credentials", "anthropic-api-key", "notion-token"])
  secret_id = "${local.name}-${each.value}"
  labels    = local.labels
  replication {
    auto {}
  }
  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "database_url_app" {
  secret      = google_secret_manager_secret.secrets["database-url-app"].id
  secret_data = local.app_db_url
}

resource "google_secret_manager_secret_version" "database_url_migrate" {
  secret      = google_secret_manager_secret.secrets["database-url-migrate"].id
  secret_data = local.migrate_db_url
}

# ── Files: PDFs, photos, imports. Uniform access, never public, signed URLs only.
resource "google_storage_bucket" "files" {
  name                        = "${var.project_id}-${local.name}-files"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = local.labels
  versioning {
    enabled = true
  }
}

# ── Images.
resource "google_artifact_registry_repository" "images" {
  repository_id = local.name
  location      = var.region
  format        = "DOCKER"
  labels        = local.labels
  depends_on    = [google_project_service.services]
}
