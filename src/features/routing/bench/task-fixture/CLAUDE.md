# parcelkit

- Python 3.10+, standard library only. Do not add dependencies.
- Money is an int number of cents everywhere; use the helpers in parcel/money.py. Never floats for money.
- Postcodes are 4-digit strings ("0110" is not "110").
- Times given to the CLI are NZ local time.
- Run the tests with `python3 -m unittest discover -s tests -t .`. One test file per module, plain unittest.
- Do not commit; the person reviews the diff.
