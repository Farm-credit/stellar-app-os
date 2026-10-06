# ────────────────────────────────────────────────────────────
# disaster-recovery.tf — Multi-Region Disaster Recovery Infrastructure
# Issue #1128: RTO < 1hr, RPO < 5min
# ────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  alias  = "primary"
  region = var.primary_region
}

provider "aws" {
  alias  = "secondary"
  region = var.secondary_region
}

variable "primary_region" {
  type    = string;
  default = "us-east-1"
}

variable "secondary_region" {
  type    = string
  default = "us-west-2"
}

variable "domain_name" {
  type    = string
  default = "harvesta.app"
}

# ─── Aurora Global Database ─────────────────────────────────

resource "aws_rds_global_cluster" "harvesta_global_db" {
  provider                  = aws.primary
  global_cluster_identifier = "harvesta-global-db"
  engine                    = "aurora-postgresql"
  engine_version            = "16.1"
  database_name             = "harvesta"
  storage_encrypted         = true
}

# Primary DB Cluster (us-east-1)
resource "aws_rds_cluster" "primary_cluster" {
  provider                  = aws.primary
  cluster_identifier        = "harvesta-aurora-us-east-1"
  global_cluster_identifier = aws_rds_global_cluster.harvesta_global_db.id
  engine                    = aws_rds_global_cluster.harvesta_global_db.engine
  engine_version            = aws_rds_global_cluster.harvesta_global_db.engine_version
  master_username           = "harvesta_admin"
  master_password           = var.db_password
  database_name             = "harvesta"
  storage_encrypted         = true
  deletion_protection       = true

  lifecycle {
    ignore_changes = [global_cluster_identifier]
  }
}

# Secondary Read Replica DB Cluster (us-west-2, RPO < 5 min WAL sync)
resource "aws_rds_cluster" "secondary_cluster" {
  provider                  = aws.secondary
  cluster_identifier        = "harvesta-aurora-us-west-2"
  global_cluster_identifier = aws_rds_global_cluster.harvesta_global_db.id
  engine                    = aws_rds_global_cluster.harvesta_global_db.engine
  engine_version            = aws_rds_global_cluster.harvesta_global_db.engine_version
  storage_encrypted         = true
  depends_on                = [aws_rds_cluster.primary_cluster]

  lifecycle {
    ignore_changes = [global_cluster_identifier]
  }
}

variable "db_password" {
  type      = string
  sensitive = true
  default   = "harvesta_secure_dr_password_2026"
}

# ─── Route53 Health Checks & Failover Routing ────────────────

resource "aws_route53_health_check" "primary_endpoint_health" {
  provider          = aws.primary
  fqdn              = "api-primary.${var.domain_name}"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = "3"
  request_interval  = "10"

  tags = {
    Name = "harvesta-primary-health-check"
  }
}

data "aws_route53_zone" "harvesta_zone" {
  provider = aws.primary
  name     = var.domain_name
}

# Primary Failover Record
resource "aws_route53_record" "api_primary_failover" {
  provider       = aws.primary
  zone_id        = data.aws_route53_zone.harvesta_zone.zone_id
  name           = "api.${var.domain_name}"
  type           = "A"
  set_identifier = "Primary-us-east-1"

  failover_routing_policy {
    type = "PRIMARY"
  }

  health_check_id = aws_route53_health_check.primary_endpoint_health.id
  alias {
    name                   = "primary-alb.${var.domain_name}"
    zone_id                = data.aws_route53_zone.harvesta_zone.zone_id
    evaluate_target_health = true
  }
}

# Secondary Failover Record
resource "aws_route53_record" "api_secondary_failover" {
  provider       = aws.primary
  zone_id        = data.aws_route53_zone.harvesta_zone.zone_id
  name           = "api.${var.domain_name}"
  type           = "A"
  set_identifier = "Secondary-us-west-2"

  failover_routing_policy {
    type = "SECONDARY"
  }

  alias {
    name                   = "secondary-alb.${var.domain_name}"
    zone_id                = data.aws_route53_zone.harvesta_zone.zone_id
    evaluate_target_health = true
  }
}
