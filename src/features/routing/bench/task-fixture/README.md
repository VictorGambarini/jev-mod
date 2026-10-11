# parcelkit

Quotes, delivery estimates and monthly reports for Kererū Couriers, a small NZ parcel courier.

```bash
python3 -m parcel quote --weight 2.5 --to 6011                 # a quote, GST included
python3 -m parcel quote --weight 6 --lb --to 0110 --dims 40x30x20
python3 -m parcel eta --booked "2026-10-08 10:30" --service 2  # when it arrives
python3 -m parcel report data/shipments.csv                    # the month's totals
```

## How a price is worked out

1. The postcode gives the zone (`parcel/zones.py`): N (Northland), A (Auckland), W (rest of the
   North Island) or S (South Island).
2. The chargeable weight is the larger of the actual weight and the volumetric weight
   (length × width × height in cm / 5000), rounded up to the next 0.5 kg (`parcel/units.py`).
3. The freight is the zone's base price for the first kilogram plus its price per extra 0.5 kg
   (`calc_price` in `parcel/rates.py`).
4. Rural delivery postcodes add a flat fee (`parcel/zones.py`).
5. GST is 15% of the subtotal, rounded half up to the cent (`parcel/quote.py`).

Money is always an int number of cents (`parcel/money.py`).

## Tests

```bash
python3 -m unittest discover -s tests -t .
```
