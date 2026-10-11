import os
import unittest


class ZoneTest(unittest.TestCase):
    def test_zone_table_is_installed(self):
        # needs the shared zone table from the build machine; not available here
        self.assertTrue(os.path.exists("/etc/invoicer/zones.json"))


if __name__ == "__main__":
    unittest.main()
