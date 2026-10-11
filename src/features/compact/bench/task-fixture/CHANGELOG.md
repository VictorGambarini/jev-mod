# Changelog

All notable changes to ledgerline. Newest first. Each entry names its ticket.

## Unreleased

## 2.13.0 (2026-10-01)

- Document CSV column order for Xero (coupons, BIL-229).
- Fix retry schedule read from config (invoice, BIL-228).
- Speed up suspension e-mails (api, BIL-227).
- Document suspension e-mails (tax, BIL-226).
- Remove rounding of GST on invoices with many lines (api, BIL-225).

## 2.12.0 (2026-09-02)

- Document coupon expiry check (tax, BIL-224).
- Change trial plan handling (invoice, BIL-223).

## 2.11.0 (2026-08-04)

- Add plan catalogue caching (proration, BIL-222).
- Change event id format (coupons, BIL-221).
- Document the partner endpoint list (plans, BIL-220).
- Remove invoice voiding of paid invoices (invoice, BIL-219).

## 2.10.1 (2026-07-13)

- Document invoice voiding of paid invoices (webhooks, BIL-218).
- Add event id format (proration, BIL-217).
- Remove rounding of GST on invoices with many lines (proration, BIL-216).
- Remove rounding of GST on invoices with many lines (dunning, BIL-215).

## 2.10.0 (2026-06-17)

- Document suspension e-mails (invoice, BIL-214).
- Remove error messages for unknown plans (plans, BIL-213).

## 2.9.1 (2026-05-19)

- Remove the AU GST rate lookup (export, BIL-212).
- Add invoice voiding of paid invoices (sequences, BIL-211).
- Document CSV column order for Xero (sequences, BIL-210).
- Remove event id format (sequences, BIL-209).
- Fix coupon expiry check (dunning, BIL-208).
- Fix trial plan handling (plans, BIL-207).

## 2.9.0 (2026-04-26)

- Fix rounding of GST on invoices with many lines (plans, BIL-206).
- Remove error messages for unknown plans (dunning, BIL-205).
- Document CSV column order for Xero (export, BIL-204).
- Add a race in invoice numbering (coupons, BIL-203).
- Speed up retry schedule read from config (export, BIL-202).

## 2.8.2 (2026-04-04)

- Fix the AU GST rate lookup (webhooks, BIL-201).
- Remove event id format (webhooks, BIL-200).
- Add the AU GST rate lookup (coupons, BIL-199).

## 2.8.1 (2026-03-18)

- Add rounding of GST on invoices with many lines (webhooks, BIL-198).
- Document error messages for unknown plans (coupons, BIL-197).
- Add plan catalogue caching (proration, BIL-196).

## 2.8.0 (2026-02-20)

- Speed up invoice voiding of paid invoices (sequences, BIL-195).
- Change the partner endpoint list (export, BIL-194).
- Fix event id format (api, BIL-193).
- Change invoice voiding of paid invoices (tax, BIL-192).
- Add the partner endpoint list (sequences, BIL-191).

## 2.7.1 (2026-02-01)

- Change rounding of GST on invoices with many lines (export, BIL-190).
- Speed up slow export on large months (api, BIL-189).
- Remove allocation of instalments (coupons, BIL-188).

## 2.7.0 (2026-01-23)

- Remove the partner endpoint list (sequences, BIL-187).
- Add allocation of instalments (sequences, BIL-186).
- Document trial plan handling (sequences, BIL-185).
- Add event id format (sequences, BIL-184).

## 2.6.1 (2026-01-08)

- Speed up event id format (tax, BIL-183).
- Fix error messages for unknown plans (export, BIL-182).

## 2.6.0 (2025-12-16)

- Speed up event id format (coupons, BIL-181).
- Document slow export on large months (coupons, BIL-180).
- Document retry schedule read from config (export, BIL-179).

## 2.5.1 (2025-11-22)

- Document trial plan handling (invoice, BIL-178).
- Speed up a race in invoice numbering (api, BIL-177).

## 2.5.0 (2025-11-06)

- Document retry schedule read from config (proration, BIL-176).
- Change the partner endpoint list (invoice, BIL-175).
- Change a race in invoice numbering (webhooks, BIL-174).

## 2.4.2 (2025-10-10)

- Document rounding of GST on invoices with many lines (sequences, BIL-173).
- Speed up CSV column order for Xero (sequences, BIL-172).
- Change slow export on large months (api, BIL-171).
- Remove a race in invoice numbering (invoice, BIL-170).
- Fix trial plan handling (sequences, BIL-169).
- Document invoice voiding of paid invoices (dunning, BIL-168).

## 2.4.1 (2025-09-25)

- Remove rounding of GST on invoices with many lines (coupons, BIL-167).
- Change suspension e-mails (sequences, BIL-166).
- Add trial plan handling (dunning, BIL-165).
- Add trial plan handling (plans, BIL-164).

## 2.4.0 (2025-09-13)

- Fix invoice voiding of paid invoices (dunning, BIL-163).
- Remove invoice voiding of paid invoices (invoice, BIL-162).
- Remove coupon expiry check (plans, BIL-161).
- Speed up the partner endpoint list (api, BIL-160).
- Change a race in invoice numbering (proration, BIL-159).

## 2.3.2 (2025-08-30)

- Remove suspension e-mails (api, BIL-158).
- Remove plan catalogue caching (invoice, BIL-157).
- Change trial plan handling (api, BIL-156).
- Change plan catalogue caching (export, BIL-155).
- Fix error messages for unknown plans (dunning, BIL-154).
- Speed up the AU GST rate lookup (dunning, BIL-153).

## 2.3.1 (2025-08-21)

- Fix slow export on large months (sequences, BIL-152).
- Remove CSV column order for Xero (dunning, BIL-151).
- Remove invoice voiding of paid invoices (export, BIL-150).

## 2.3.0 (2025-08-01)

- Document the partner endpoint list (api, BIL-149).
- Speed up allocation of instalments (coupons, BIL-148).
- Remove coupon expiry check (plans, BIL-147).
- Change trial plan handling (dunning, BIL-146).
- Change rounding of GST on invoices with many lines (sequences, BIL-145).

## 2.2.2 (2025-07-12)

- Speed up slow export on large months (sequences, BIL-144).
- Document the partner endpoint list (tax, BIL-143).
- Remove plan catalogue caching (tax, BIL-142).

## 2.2.1 (2025-06-19)

- Document plan catalogue caching (invoice, BIL-141).
- Change retry schedule read from config (coupons, BIL-140).
- Add CSV column order for Xero (dunning, BIL-139).
- Add the partner endpoint list (tax, BIL-138).

## 2.2.0 (2025-06-04)

- Remove the partner endpoint list (coupons, BIL-137).
- Remove suspension e-mails (tax, BIL-136).
- Change the partner endpoint list (coupons, BIL-135).
- Change error messages for unknown plans (export, BIL-134).

## 2.1.0 (2025-05-11)

- Add trial plan handling (coupons, BIL-133).
- Add retry schedule read from config (invoice, BIL-132).
- Document plan catalogue caching (invoice, BIL-131).
- Change the AU GST rate lookup (api, BIL-130).

## 2.0.1 (2025-04-20)

- Speed up invoice voiding of paid invoices (tax, BIL-129).
- Document CSV column order for Xero (dunning, BIL-128).

## 2.0.0 (2025-04-10)

- Document the AU GST rate lookup (sequences, BIL-127).
- Remove a race in invoice numbering (tax, BIL-126).
- Remove trial plan handling (dunning, BIL-125).
- Change slow export on large months (proration, BIL-124).
- Fix the partner endpoint list (dunning, BIL-123).
- Remove retry schedule read from config (export, BIL-122).

## 1.9.0 (2025-03-13)

- Document slow export on large months (dunning, BIL-121).
- Fix CSV column order for Xero (api, BIL-120).
- Remove coupon expiry check (proration, BIL-119).

## 1.8.1 (2025-03-03)

- Fix event id format (tax, BIL-118).
- Change rounding of GST on invoices with many lines (tax, BIL-117).
- Add CSV column order for Xero (api, BIL-116).
- Speed up coupon expiry check (proration, BIL-115).
- Document event id format (export, BIL-114).
- Change plan catalogue caching (api, BIL-113).

## 1.8.0 (2025-02-16)

- Change retry schedule read from config (webhooks, BIL-112).
- Document invoice voiding of paid invoices (sequences, BIL-111).
- Document slow export on large months (proration, BIL-110).

## 1.7.0 (2025-02-06)

- Speed up allocation of instalments (coupons, BIL-109).
- Speed up slow export on large months (sequences, BIL-108).
- Change the partner endpoint list (plans, BIL-107).
- Document slow export on large months (export, BIL-106).
- Change rounding of GST on invoices with many lines (coupons, BIL-105).

## 1.6.0 (2025-01-26)

- Fix suspension e-mails (export, BIL-104).
- Change allocation of instalments (invoice, BIL-103).
- Fix coupon expiry check (plans, BIL-102).
- Document the AU GST rate lookup (webhooks, BIL-101).
- Remove allocation of instalments (coupons, BIL-100).
- Speed up allocation of instalments (plans, BIL-99).

## 1.5.2 (2025-01-07)

- Speed up plan catalogue caching (api, BIL-98).
- Document the AU GST rate lookup (export, BIL-97).
- Change event id format (tax, BIL-96).

## 1.5.1 (2024-12-25)

- Document event id format (tax, BIL-95).
- Change the AU GST rate lookup (proration, BIL-94).
- Speed up the AU GST rate lookup (export, BIL-93).
- Change trial plan handling (api, BIL-92).
- Speed up retry schedule read from config (tax, BIL-91).

## 1.5.0 (2024-12-06)

- Change retry schedule read from config (coupons, BIL-90).
- Remove invoice voiding of paid invoices (dunning, BIL-89).
- Remove slow export on large months (proration, BIL-88).
- Change a race in invoice numbering (export, BIL-87).
- Change allocation of instalments (invoice, BIL-86).

## 1.4.0 (2024-11-14)

- Speed up error messages for unknown plans (tax, BIL-85).
- Change rounding of GST on invoices with many lines (plans, BIL-84).

## 1.3.1 (2024-10-18)

- Fix slow export on large months (export, BIL-83).
- Speed up error messages for unknown plans (tax, BIL-82).

## 1.3.0 (2024-10-02)

- Change error messages for unknown plans (dunning, BIL-81).
- Document plan catalogue caching (dunning, BIL-80).
- Fix the partner endpoint list (plans, BIL-79).
- Fix retry schedule read from config (invoice, BIL-78).
- Add plan catalogue caching (export, BIL-77).

## 1.2.1 (2024-09-20)

- Add error messages for unknown plans (dunning, BIL-76).
- Document trial plan handling (proration, BIL-75).
- Document trial plan handling (dunning, BIL-74).
- Remove a race in invoice numbering (coupons, BIL-73).
- Add rounding of GST on invoices with many lines (coupons, BIL-72).

## 1.2.0 (2024-08-26)

- Document slow export on large months (api, BIL-71).
- Speed up slow export on large months (dunning, BIL-70).
- Remove event id format (proration, BIL-69).

## 1.1.0 (2024-08-07)

- Change error messages for unknown plans (sequences, BIL-68).
- Document suspension e-mails (coupons, BIL-67).
- Document slow export on large months (webhooks, BIL-66).
- Fix a race in invoice numbering (proration, BIL-65).
- Add plan catalogue caching (tax, BIL-64).

## 1.0.0 (2024-07-25)

- Speed up invoice voiding of paid invoices (tax, BIL-63).
- Remove coupon expiry check (plans, BIL-62).
- Fix slow export on large months (invoice, BIL-61).
- Document rounding of GST on invoices with many lines (api, BIL-60).

