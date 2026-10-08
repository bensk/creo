output "app_url" {
  value = google_cloud_run_v2_service.app.uri
}

output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "workload_identity_provider" {
  description = "Set as the GCP_WORKLOAD_IDENTITY_PROVIDER repository variable."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account" {
  description = "Set as the GCP_DEPLOYER_SERVICE_ACCOUNT repository variable."
  value       = google_service_account.deployer.email
}

output "directory_service_account_client_id" {
  description = "Authorize this client ID for domain-wide delegation in the Workspace admin console (read-only Directory scopes)."
  value       = google_service_account.directory.unique_id
}

output "database_name" {
  value = local.database_name
}
