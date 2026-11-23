resource "aws_db_subnet_group" "sac" {
  name       = var.name
  subnet_ids = values(aws_subnet.banco)[*].id
}

resource "aws_db_instance" "sac" {
  identifier                  = var.name
  db_name                     = "sac"
  engine                      = "postgres"
  engine_version              = "17"
  instance_class              = "db.t4g.micro"
  allocated_storage           = 20
  max_allocated_storage       = 50
  storage_type                = "gp3"
  storage_encrypted           = true
  multi_az                    = var.multi_az
  publicly_accessible         = false
  backup_retention_period     = 7
  deletion_protection         = var.deletion_protection
  skip_final_snapshot         = false
  final_snapshot_identifier   = "${var.name}-final"
  username                    = "sac_admin"
  manage_master_user_password = true
  db_subnet_group_name        = aws_db_subnet_group.sac.name
  vpc_security_group_ids      = [aws_security_group.banco.id]
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/sac/${var.name}/api"
  retention_in_days = 14
}

resource "aws_s3_bucket" "alb" {
  bucket_prefix = "${var.name}-alb-"
}
resource "aws_s3_bucket_public_access_block" "alb" {
  bucket                  = aws_s3_bucket.alb.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_lifecycle_configuration" "alb" {
  bucket = aws_s3_bucket.alb.id
  rule {
    id     = "expiration"
    status = "Enabled"
    filter {}
    expiration {
      days = 30
    }
  }
}
resource "aws_s3_bucket_policy" "alb" {
  bucket = aws_s3_bucket.alb.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "logdelivery.elasticloadbalancing.amazonaws.com" }
      Action    = "s3:PutObject"
      Resource  = "${aws_s3_bucket.alb.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
      Condition = { ArnLike = { "aws:SourceArn" = "arn:${data.aws_partition.current.partition}:elasticloadbalancing:${var.region}:${data.aws_caller_identity.current.account_id}:loadbalancer/*" } }
    }]
  })
}
resource "aws_lb" "app" {
  name                       = var.name
  load_balancer_type         = "application"
  subnets                    = values(aws_subnet.publica)[*].id
  security_groups            = [aws_security_group.alb.id]
  drop_invalid_header_fields = true
  access_logs {
    bucket  = aws_s3_bucket.alb.id
    enabled = true
  }
  depends_on = [aws_s3_bucket_policy.alb]
}
resource "aws_lb_target_group" "api" {
  name                 = "${var.name}-api"
  port                 = 3000
  protocol             = "HTTP"
  vpc_id               = aws_vpc.app.id
  deregistration_delay = 15
  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 10
    timeout             = 3
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
}
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
resource "aws_route53_record" "api" {
  zone_id = var.zone_id
  name    = var.hostname
  type    = "A"
  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}

resource "aws_iam_role" "api" {
  name = "${var.name}-api"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole"
    }]
  })
}
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_role_policy" "api" {
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.app_secret_arn },
      { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      { Effect = "Allow", Action = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"], Resource = data.aws_ecr_repository.app.arn },
      { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.api.arn}:*" }
    ]
  })
}
resource "aws_iam_instance_profile" "api" {
  name = "${var.name}-api"
  role = aws_iam_role.api.name
}
resource "aws_launch_template" "api" {
  name_prefix            = "${var.name}-"
  image_id               = var.ami_id
  instance_type          = "t3.micro"
  vpc_security_group_ids = [aws_security_group.api.id]
  iam_instance_profile {
    arn = aws_iam_instance_profile.api.arn
  }
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }
  user_data = base64encode(templatefile("${path.module}/user-data.sh.tftpl", {
    region     = var.region
    registry   = split("/", var.repository_url)[0]
    image      = "${var.repository_url}:${var.image_tag}"
    secret_arn = var.app_secret_arn
    db_host    = aws_db_instance.sac.address
    log_group  = aws_cloudwatch_log_group.api.name
  }))
}

resource "aws_autoscaling_group" "api" {
  name                      = "${var.name}-api"
  min_size                  = 2
  max_size                  = 4
  desired_capacity          = 2
  vpc_zone_identifier       = values(aws_subnet.api)[*].id
  target_group_arns         = [aws_lb_target_group.api.arn]
  health_check_type         = "ELB"
  health_check_grace_period = 360
  default_instance_warmup   = 180
  launch_template {
    id      = aws_launch_template.api.id
    version = aws_launch_template.api.latest_version
  }
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 100
      max_healthy_percentage = 200
    }
  }
  lifecycle {
    ignore_changes = [desired_capacity]
  }
  depends_on = [
    aws_lb_listener.https, aws_route_table_association.api,
    aws_iam_role_policy.api, aws_iam_role_policy_attachment.ssm
  ]
}

resource "aws_autoscaling_policy" "requests" {
  name                   = "${var.name}-requests"
  autoscaling_group_name = aws_autoscaling_group.api.name
  policy_type            = "TargetTrackingScaling"
  target_tracking_configuration {
    target_value = 500
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.app.arn_suffix}/${aws_lb_target_group.api.arn_suffix}"
    }
  }
}

locals {
  alarms = {
    p95 = {
      namespace  = "AWS/ApplicationELB"
      metric     = "TargetResponseTime", stat = null, extended = "p95", threshold = 1
      operator   = "GreaterThanThreshold"
      dimensions = tomap({ LoadBalancer = aws_lb.app.arn_suffix, TargetGroup = aws_lb_target_group.api.arn_suffix })
    }
    elb_errors = {
      namespace  = "AWS/ApplicationELB"
      metric     = "HTTPCode_ELB_5XX_Count", stat = "Sum", extended = null, threshold = 5
      operator   = "GreaterThanOrEqualToThreshold"
      dimensions = tomap({ LoadBalancer = aws_lb.app.arn_suffix })
    }
    healthy = {
      namespace  = "AWS/ApplicationELB"
      metric     = "HealthyHostCount", stat = "Minimum", extended = null, threshold = 2
      operator   = "LessThanThreshold"
      dimensions = tomap({ LoadBalancer = aws_lb.app.arn_suffix, TargetGroup = aws_lb_target_group.api.arn_suffix })
    }
    database_connections = {
      namespace  = "AWS/RDS"
      metric     = "DatabaseConnections", stat = "Maximum", extended = null, threshold = 24
      operator   = "GreaterThanOrEqualToThreshold"
      dimensions = tomap({ DBInstanceIdentifier = aws_db_instance.sac.identifier })
    }
  }
}
resource "aws_cloudwatch_metric_alarm" "api" {
  for_each            = local.alarms
  alarm_name          = "${var.name}-${each.key}"
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.stat
  extended_statistic  = each.value.extended
  comparison_operator = each.value.operator
  evaluation_periods  = 2
  period              = 60
  threshold           = each.value.threshold
  treat_missing_data  = "missing"
  dimensions          = each.value.dimensions
}

output "url" {
  value = "https://${aws_route53_record.api.fqdn}"
}
output "rds_host" {
  value = aws_db_instance.sac.address
}
output "rds_admin_secret_arn" {
  value = aws_db_instance.sac.master_user_secret[0].secret_arn
}
output "autoscaling_group" {
  value = aws_autoscaling_group.api.name
}
