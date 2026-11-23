locals {
  azs = {
    for index, zone in slice(data.aws_availability_zones.available.names, 0, 2) :
    zone => index
  }
}

resource "aws_vpc" "app" {
  cidr_block           = "10.44.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_subnet" "publica" {
  for_each          = local.azs
  vpc_id            = aws_vpc.app.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(aws_vpc.app.cidr_block, 8, each.value)
}
resource "aws_subnet" "api" {
  for_each          = local.azs
  vpc_id            = aws_vpc.app.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(aws_vpc.app.cidr_block, 8, 10 + each.value)
}
resource "aws_subnet" "banco" {
  for_each          = local.azs
  vpc_id            = aws_vpc.app.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(aws_vpc.app.cidr_block, 8, 20 + each.value)
}

resource "aws_internet_gateway" "app" {
  vpc_id = aws_vpc.app.id
}
resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.app.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.app.id
  }
}
resource "aws_route_table_association" "publica" {
  for_each       = aws_subnet.publica
  subnet_id      = each.value.id
  route_table_id = aws_route_table.publica.id
}

resource "aws_eip" "nat" {
  for_each = local.azs
  domain   = "vpc"
}
resource "aws_nat_gateway" "api" {
  for_each      = aws_subnet.publica
  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = each.value.id
  depends_on    = [aws_internet_gateway.app]
}
resource "aws_route_table" "api" {
  for_each = local.azs
  vpc_id   = aws_vpc.app.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.api[each.key].id
  }
}
resource "aws_route_table_association" "api" {
  for_each       = aws_subnet.api
  subnet_id      = each.value.id
  route_table_id = aws_route_table.api[each.key].id
}
resource "aws_route_table" "banco" {
  vpc_id = aws_vpc.app.id
}
resource "aws_route_table_association" "banco" {
  for_each       = aws_subnet.banco
  subnet_id      = each.value.id
  route_table_id = aws_route_table.banco.id
}

resource "aws_security_group" "alb" {
  name   = "${var.name}-alb"
  vpc_id = aws_vpc.app.id
}
resource "aws_security_group" "api" {
  name   = "${var.name}-api"
  vpc_id = aws_vpc.app.id
}
resource "aws_security_group" "banco" {
  name   = "${var.name}-database"
  vpc_id = aws_vpc.app.id
}

resource "aws_vpc_security_group_ingress_rule" "internet_alb" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = var.ingress_cidr
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}
resource "aws_vpc_security_group_egress_rule" "alb_api" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.api.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
}
resource "aws_vpc_security_group_ingress_rule" "api_alb" {
  security_group_id            = aws_security_group.api.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
}
resource "aws_vpc_security_group_egress_rule" "api_banco" {
  security_group_id            = aws_security_group.api.id
  referenced_security_group_id = aws_security_group.banco.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}
resource "aws_vpc_security_group_ingress_rule" "banco_api" {
  security_group_id            = aws_security_group.banco.id
  referenced_security_group_id = aws_security_group.api.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}
resource "aws_vpc_security_group_egress_rule" "api_https" {
  security_group_id = aws_security_group.api.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}
