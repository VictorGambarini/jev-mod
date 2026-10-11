import json
import unittest

from billing.webhooks import encode, event, invoice_paid, sign_payload, verify_signature

KEY = "test-signing-key"
NOW = 1_760_000_000


class SignatureTest(unittest.TestCase):
    def test_round_trip(self):
        payload = event("invoice.paid", "evt_1", NOW, {"customer_name": "Kowhai Labs", "total_cents": 14835})
        header = sign_payload(payload, KEY, NOW)
        self.assertTrue(verify_signature(encode(payload), header, KEY, NOW + 5))

    def test_rejects_a_tampered_body(self):
        payload = event("invoice.paid", "evt_2", NOW, {"total_cents": 14835})
        header = sign_payload(payload, KEY, NOW)
        tampered = encode({**payload, "data": {"total_cents": 1}})
        self.assertFalse(verify_signature(tampered, header, KEY, NOW))

    def test_rejects_an_old_delivery(self):
        payload = event("invoice.paid", "evt_3", NOW, {})
        header = sign_payload(payload, KEY, NOW - 400)
        self.assertFalse(verify_signature(encode(payload), header, KEY, NOW))

    def test_rejects_a_malformed_header(self):
        self.assertFalse(verify_signature(b"{}", "nonsense", KEY, NOW))

    def test_tolerates_whitespace_a_proxy_adds(self):
        payload = event("invoice.paid", "evt_4", NOW, {"total_cents": 100})
        header = sign_payload(payload, KEY, NOW)
        spaced = json.dumps(payload, indent=2).encode()
        self.assertTrue(verify_signature(spaced, header, KEY, NOW))


class EventTest(unittest.TestCase):
    def test_invoice_paid_shape(self):
        e = invoice_paid({"number": "INV-000001", "total_cents": 14835}, "Kowhai Labs", "evt_5", NOW)
        self.assertEqual(e["type"], "invoice.paid")
        self.assertEqual(e["data"]["customer_name"], "Kowhai Labs")
        self.assertEqual(json.loads(encode(e))["id"], "evt_5")


if __name__ == "__main__":
    unittest.main()
