# Runbook: webhooks

A delivery that fails eight times is parked as `failed`. Support can replay it from the admin page. If many deliveries
are pending, check the sweep job; refund and dispute events come in through `/webhooks/provider`.
