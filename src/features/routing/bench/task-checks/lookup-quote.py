import re
import subprocess
import unittest

from _common import ANSWER, WORK, main


class Check(unittest.TestCase):
    def test_answer(self):
        # 40x30x25 cm is 6 kg volumetric: zone S, 1349 + 10 * 173 = 3079, GST 462, total 3541
        self.assertRegex(ANSWER.replace(",", ""), r"\$?\b35\.41\b")

    def test_nothing_changed(self):
        r = subprocess.run(["git", "status", "--porcelain"], cwd=WORK, capture_output=True, text=True)
        self.assertEqual(r.stdout.strip(), "")


if __name__ == "__main__":
    main()
