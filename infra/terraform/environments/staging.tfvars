# terraform apply -var-file=environments/staging.tfvars
project_id        = "creo-sis-staging" # replace with the real project ID
environment       = "staging"
app_url           = "https://staging.sis.creoprep.org"
db_tier           = "db-custom-1-3840"
app_min_instances = 0
