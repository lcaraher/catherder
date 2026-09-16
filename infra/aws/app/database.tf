# RDS creates and rotates the master password itself; the secret ARN is an output.
resource "aws_db_instance" "postgres" {
  identifier                 = "${local.name_prefix}-postgres"
  engine                     = "postgres"
  engine_version             = "16.15"
  auto_minor_version_upgrade = true

  instance_class    = "db.t4g.micro"
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name                     = "catherder"
  username                    = "catherder_admin"
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false
  multi_az               = false
  network_type           = "IPV4"

  # The account's free plan caps automated backup retention at 1 day; raise to 7 when the plan ends.
  backup_retention_period = 1
  backup_window           = "07:00-08:00"
  maintenance_window      = "Sun:08:00-Sun:09:00"
  copy_tags_to_snapshot   = true

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name_prefix}-postgres-final"

  apply_immediately = true

  performance_insights_enabled = false
  monitoring_interval          = 0
}
