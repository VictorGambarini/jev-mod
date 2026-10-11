# Runbook

- Staging host: staging-01.corp.example (the nightly job runs there at 02:00)
- Database: db.corp.example, PostgreSQL on port 5432
- Config: config/app.yml (copied to the host on deploy)
- Logs: /var/log/ingest/nightly.log on the host. A copy of the latest run is kept in logs/nightly-latest.log
- Deploy record: deploy/deployed.txt (written by the deploy job)
