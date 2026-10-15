# terraform init -reconfigure -backend-config=environments/prod.backend.hcl
# The state bucket is created once by hand (docs/operations/deploy.md), in ap-south-1.
bucket       = "CHANGE-zynetix-tfstate-<account-id>"
key          = "zynetix/prod/terraform.tfstate"
region       = "ap-south-1"
encrypt      = true
use_lockfile = true
