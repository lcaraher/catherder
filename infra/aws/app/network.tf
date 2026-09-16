resource "aws_vpc" "this" {
  cidr_block                       = var.vpc_cidr
  assign_generated_ipv6_cidr_block = true
  enable_dns_support               = true
  enable_dns_hostnames             = true

  tags = {
    Name = "${local.name_prefix}-vpc"
  }
}

# App subnets: private IPv4 plus a routable IPv6 /64; egress is IPv6 only.
resource "aws_subnet" "app" {
  count = length(var.availability_zones)

  vpc_id                          = aws_vpc.this.id
  availability_zone               = var.availability_zones[count.index]
  cidr_block                      = cidrsubnet(var.vpc_cidr, 8, count.index)
  ipv6_cidr_block                 = cidrsubnet(aws_vpc.this.ipv6_cidr_block, 8, count.index)
  assign_ipv6_address_on_creation = true
  map_public_ip_on_launch         = false

  tags = {
    Name = "${local.name_prefix}-app-${var.availability_zones[count.index]}"
  }
}

# Database subnets: IPv4 only, no route out of the VPC.
resource "aws_subnet" "db" {
  count = length(var.availability_zones)

  vpc_id                  = aws_vpc.this.id
  availability_zone       = var.availability_zones[count.index]
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  map_public_ip_on_launch = false

  tags = {
    Name = "${local.name_prefix}-db-${var.availability_zones[count.index]}"
  }
}

resource "aws_egress_only_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${local.name_prefix}-eigw"
  }
}

resource "aws_route_table" "app" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${local.name_prefix}-app"
  }
}

# IPv6 default route only; there is deliberately no IPv4 route out.
resource "aws_route" "app_ipv6_default" {
  route_table_id              = aws_route_table.app.id
  destination_ipv6_cidr_block = "::/0"
  egress_only_gateway_id      = aws_egress_only_internet_gateway.this.id
}

resource "aws_route_table_association" "app" {
  count = length(aws_subnet.app)

  subnet_id      = aws_subnet.app[count.index].id
  route_table_id = aws_route_table.app.id
}

# Local route only.
resource "aws_route_table" "db" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${local.name_prefix}-db"
  }
}

resource "aws_route_table_association" "db" {
  count = length(aws_subnet.db)

  subnet_id      = aws_subnet.db[count.index].id
  route_table_id = aws_route_table.db.id
}

resource "aws_db_subnet_group" "db" {
  name       = "${local.name_prefix}-db"
  subnet_ids = aws_subnet.db[*].id

  tags = {
    Name = "${local.name_prefix}-db"
  }
}

resource "aws_security_group" "lambda" {
  name        = "${local.name_prefix}-lambda"
  description = "Application Lambda functions"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${local.name_prefix}-lambda"
  }
}

resource "aws_vpc_security_group_egress_rule" "lambda_https_ipv6" {
  security_group_id = aws_security_group.lambda.id
  description       = "HTTPS out over IPv6"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv6         = "::/0"
}

resource "aws_vpc_security_group_egress_rule" "lambda_postgres" {
  security_group_id            = aws_security_group.lambda.id
  description                  = "PostgreSQL to the database"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.database.id
}

resource "aws_security_group" "database" {
  name        = "${local.name_prefix}-database"
  description = "PostgreSQL database"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${local.name_prefix}-database"
  }
}

resource "aws_vpc_security_group_ingress_rule" "database_postgres" {
  security_group_id            = aws_security_group.database.id
  description                  = "PostgreSQL from the application Lambda functions"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.lambda.id
}
