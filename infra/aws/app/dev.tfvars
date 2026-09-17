environment = "dev"
domain_name = "catherderapp.com"

# localhost entries let the app be tested locally against the real dev pool.
app_callback_urls = ["https://dev.catherderapp.com/auth/callback", "http://localhost:3001/auth/callback"]
app_logout_urls   = ["https://dev.catherderapp.com/", "http://localhost:3001/"]

# Placeholders; C5 sets these from the pipeline.
migrate_image_tag = "migrate-9584e88"
app_image_tag     = "app-298c1f6"
