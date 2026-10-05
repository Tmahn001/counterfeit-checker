"""Launch catalogue preloaded by ``seed_dev`` / ``seed_products``.

These are catalogue entries only. A product becomes scannable once its manufacturer (or, for a
demonstration, the project owner) uploads reference macro-photographs of a genuine item through the
OEM portal and the baseline job completes.
"""

NIGERIAN_PRODUCTS = [
    (
        "cway-table-water-75cl",
        "CWAY Table Water 75cl",
        "CWAY Food & Beverages Nigeria",
        "75 cl PET bottle",
        "food_beverage",
    ),
    (
        "gala-sausage-roll",
        "Gala Sausage Roll",
        "UAC Foods",
        "single roll, film wrap",
        "food_beverage",
    ),
    ("minimie-chinchin", "Minimie Chinchin", "Dufil Prima Foods", "45 g sachet", "food_beverage"),
    (
        "indomie-chicken-70g",
        "Indomie Instant Noodles (Chicken) 70g",
        "Dufil Prima Foods",
        "70 g pack",
        "food_beverage",
    ),
    (
        "peak-evaporated-milk-160g",
        "Peak Evaporated Milk 160g",
        "FrieslandCampina WAMCO",
        "160 g tin",
        "food_beverage",
    ),
    ("milo-sachet-20g", "Nestlé Milo 20g Sachet", "Nestlé Nigeria", "20 g sachet", "food_beverage"),
    (
        "emzor-paracetamol-500mg",
        "Emzor Paracetamol 500mg",
        "Emzor Pharmaceutical Industries",
        "blister of 12 tablets",
        "pharmaceutical",
    ),
]

DEMO_PRODUCTS = [
    (
        "synthetic_product_01",
        "Synthetic Product 01 (demo)",
        "authentic-edge",
        "procedural texture",
        "demo",
    ),
    (
        "synthetic_product_02",
        "Synthetic Product 02 (demo)",
        "authentic-edge",
        "procedural texture",
        "demo",
    ),
]
