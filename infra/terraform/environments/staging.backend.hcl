# terraform init -reconfigure -backend-config=environments/staging.backend.hcl
# The state bucket is created once by hand (docs/operations/deploy.md), in ap-south-1.
bucket       = "CHANGE-kinetix-tfstate-<account-id>"
key          = "kinetix/staging/terraform.tfstate"
region       = "ap-south-1"
encrypt      = true
use_lockfile = true
