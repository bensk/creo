variable "project_id" {
  description = "Google Cloud project for this environment (one project per environment)."
  type        = string
}

variable "environment" {
  description = "staging or production."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "region" {
  type    = string
  default = "us-east4"
}

variable "app_url" {
  description = "Public URL of the app, e.g. https://sis.creoprep.org. Used for the Google sign-in redirect."
  type        = string
}

variable "workspace_domain" {
  type    = string
  default = "creoprep.org"
}

variable "google_client_id" {
  description = "OAuth client ID for Google sign-in. Empty until the OAuth client exists; sign-in pages then say Google sign-in isn't set up."
  type        = string
  default     = ""
}

variable "directory_admin_email" {
  description = "Workspace admin the Directory service account acts as (read-only scopes). Empty disables Directory sync."
  type        = string
  default     = ""
}

variable "github_repository" {
  description = "owner/repo allowed to deploy through Workload Identity Federation."
  type        = string
  default     = "bensk/creo"
}

variable "db_tier" {
  description = "Cloud SQL machine tier. Production starts at 2 vCPU."
  type        = string
  default     = "db-custom-2-7680"
}

variable "app_min_instances" {
  description = "Warm instances. Production keeps 2 so there are no cold starts at 7:55 a.m."
  type        = number
  default     = 0
}

variable "app_max_instances" {
  type    = number
  default = 10
}

variable "app_image" {
  description = "Initial image. Deploys replace it (see .github/workflows/deploy.yml); Terraform ignores later changes."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "notion_bdt_data_source_id" {
  description = "Notion data source ID of the current Big Data Tracker. Empty disables the nightly import (production only)."
  type        = string
  default     = ""
}
