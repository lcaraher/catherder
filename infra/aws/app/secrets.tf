# No secret version here: the value is written once with the CLI so it never enters state.
resource "aws_secretsmanager_secret" "session" {
  name                    = "${local.name_prefix}/auth-session-secret"
  description             = "Signing secret for the app's session cookie; value set by hand, never by Terraform."
  recovery_window_in_days = 7
}
