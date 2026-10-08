terraform {
  required_version = ">= 1.13"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.5"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
  # State lives in a GCS bucket per environment:
  #   terraform init -backend-config="bucket=<project>-tfstate" -backend-config="prefix=creo-sis"
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}
