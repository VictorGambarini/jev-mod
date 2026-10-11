import os
import unittest

from notekeeper.store import Store


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.path = "data/test.db"
        if os.path.exists(self.path):
            os.remove(self.path)
        self.store = Store(self.path)
        self.store.ensure()

    def tearDown(self):
        self.store.db.close()
        os.remove(self.path)

    def test_add_and_list(self):
        self.store.add("a", "first")
        self.store.add("b", "second")
        self.assertEqual([n[1] for n in self.store.notes()], ["a", "b"])

    def test_limit(self):
        for i in range(5):
            self.store.add(str(i), "x")
        self.assertEqual(len(self.store.notes(limit=2)), 2)


if __name__ == "__main__":
    unittest.main()
