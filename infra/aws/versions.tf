terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = var.name }
  }
}

variable "region" {
  type    = string
  default = "sa-east-1"
}
variable "name" {
  type    = string
  default = "sac-tde"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,18}[a-z0-9]$", var.name))
    error_message = "Informe de 3 a 20 caracteres com letras minúsculas, números ou hífens."
  }
}
variable "hostname" {
  type = string
}
variable "zone_id" {
  type = string
}
variable "certificate_arn" {
  type = string
}
variable "ingress_cidr" {
  type = string
}
variable "ami_id" {
  description = "AMI x86_64 Amazon Linux 2023, fixada por ambiente."
  type        = string
}
variable "repository_url" {
  description = "URL de um repositório ECR privado na mesma conta e região."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}\\.dkr\\.ecr\\.[a-z0-9-]+\\.amazonaws\\.com/[a-z0-9/_-]+$", var.repository_url))
    error_message = "Informe a URL do repositório ECR, sem tag."
  }
}
variable "image_tag" {
  description = "Tag imutável da imagem."
  type        = string
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]{1,128}$", var.image_tag))
    error_message = "Informe uma tag Docker válida."
  }
}
variable "app_secret_arn" {
  description = "Secrets Manager com api_key e password do usuário sac_app, criptografado com a chave gerenciada da AWS."
  type        = string
}
variable "multi_az" {
  type    = bool
  default = true
}
variable "deletion_protection" {
  type    = bool
  default = true
}

data "aws_availability_zones" "available" {
  state = "available"
}
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_ecr_repository" "app" {
  name = join("/", slice(split("/", var.repository_url), 1, length(split("/", var.repository_url))))
}
