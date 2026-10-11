"""Weights and sizes."""

import math

KG_PER_LB = 0.45359237
VOLUMETRIC_DIVISOR = 5000  # cm³ per kg


def lb_to_kg(lb: float) -> float:
    """Pounds to kilograms."""
    return lb / KG_PER_LB


def volumetric_kg(length_cm: float, width_cm: float, height_cm: float) -> float:
    """The weight a box is charged at for its size."""
    return length_cm * width_cm * height_cm / VOLUMETRIC_DIVISOR


def chargeable_kg(actual_kg: float, dims_cm: tuple[float, float, float] | None = None) -> float:
    """The larger of the actual and the volumetric weight, rounded up to the next 0.5 kg (0.5 at least)."""
    kg = actual_kg
    if dims_cm is not None:
        kg = max(kg, volumetric_kg(*dims_cm))
    halves = math.ceil(round(kg * 2, 6))
    return max(halves, 1) / 2
