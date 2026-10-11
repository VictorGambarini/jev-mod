# Runbook: dunning

The dunning job runs nightly and sends reminders for overdue invoices. If reminders stopped, check the job log for
`job dunning failed`, then run `npm run job -- dunning` by hand.
