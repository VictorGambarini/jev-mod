import unittest

from app.utils import chunk, paginate


class PaginateTest(unittest.TestCase):
    def test_first_page(self):
        self.assertEqual(paginate(list(range(10)), 1, 4), [0, 1, 2, 3])

    def test_last_page_is_short(self):
        self.assertEqual(paginate(list(range(10)), 3, 4), [8, 9])

    def test_past_the_end_is_empty(self):
        self.assertEqual(paginate(list(range(10)), 4, 4), [])


class ChunkTest(unittest.TestCase):
    def test_chunk(self):
        self.assertEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])


if __name__ == "__main__":
    unittest.main()
