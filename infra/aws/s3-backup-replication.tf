# ────────────────────────────────────────────────────────────
# s3-backup-replication.tf — Automated S3 Backup & Cross-Region Replication
# Issue #1127: Daily encrypted database backups with S3 CRR
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
  region = "us-east-1"
}

provider "aws" {
  alias  = "secondary"
  region = "us-west-2"
}

# ─── KMS Key for Backup Encryption at Rest ──────────────────

resource "aws_kms_key" "backup_key" {
  provider                = aws.primary
  description             = "KMS key for automated database backup encryption at rest"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Environment = "production"
    Service     = "harvesta-backup"
  }
}

# ─── Primary S3 Bucket (us-east-1) ──────────────────────────

resource "aws_s3_bucket" "primary_backup" {
  provider      = aws.primary
  bucket        = "harvesta-db-backups-primary"
  force_destroy = false

  tags = {
    Name        = "harvesta-db-backups-primary"
    Environment = "production"
  }
}

resource "aws_s3_bucket_versioning" "primary_versioning" {
  provider = aws.primary
  bucket   = aws_s3_bucket.primary_backup.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "primary_encryption" {
  provider = aws.primary
  bucket   = aws_s3_bucket.primary_backup.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.backup_key.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# ─── Secondary S3 Bucket (us-west-2) for CRR ────────────────

resource "aws_s3_bucket" "secondary_backup" {
  provider      = aws.secondary
  bucket        = "harvesta-db-backups-replica"
  force_destroy = false

  tags = {
    Name        = "harvesta-db-backups-replica"
    Environment = "production"
  }
}

resource "aws_s3_bucket_versioning" "secondary_versioning" {
  provider = aws.secondary
  bucket   = aws_s3_bucket.secondary_backup.id
  versioning_configuration {
    status = "Enabled"
  }
}

# ─── IAM Role for Cross-Region Replication ──────────────────

resource "aws_iam_role" "replication_role" {
  provider = aws.primary
  name     = "harvesta-s3-replication-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_policy" "replication_policy" {
  provider = aws.primary
  name     = "harvesta-s3-replication-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "s3:GetReplicationConfiguration",
          "s3:ListBucket"
        ]
        Effect   = "Allow"
        Resource = [aws_s3_bucket.primary_backup.arn]
      },
      {
        Action = [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl",
          "s3:GetObjectVersionTagging"
        ]
        Effect   = "Allow"
        Resource = ["${aws_s3_bucket.primary_backup.arn}/*"]
      },
      {
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete",
          "s3:ReplicateTags"
        ]
        Effect   = "Allow"
        Resource = ["${aws_s3_bucket.secondary_backup.arn}/*"]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "replication_attachment" {
  provider   = aws.primary
  role       = aws_iam_role.replication_role.name
  policy_arn = aws_iam_policy.replication_policy.arn
}

# ─── S3 Bucket Cross-Region Replication Configuration ──────

resource "aws_s3_bucket_replication_configuration" "primary_to_secondary" {
  provider   = aws.primary
  depends_on = [aws_s3_bucket_versioning.primary_versioning]

  role   = aws_iam_role.replication_role.arn
  bucket = aws_s3_bucket.primary_backup.id

  rule {
    id     = "db-backups-crr"
    status = "Enabled"

    filter {
      prefix = "db-backups/"
    }

    destination {
      bucket        = aws_s3_bucket.secondary_backup.arn
      storage_class = "STANDARD"
    }
  }
}

# ─── Lifecycle Rule (Archive to Glacier & 30-Day Prune) ─────

resource "aws_s3_bucket_lifecycle_configuration" "primary_lifecycle" {
  provider = aws.primary
  bucket   = aws_s3_bucket.primary_backup.id

  rule {
    id     = "archive-and-prune"
    status = "Enabled"

    filter {
      prefix = "db-backups/"
    }

    transition {
      days          = 7
      storage_class = "GLACIER_IR"
    }

    expiration {
      days = 30
    }
  }
}
