"""Idempotently load the launch product catalogue (safe in any environment)."""

from django.core.management.base import BaseCommand

from oem.catalogue import DEMO_PRODUCTS, NIGERIAN_PRODUCTS
from oem.models import Product


class Command(BaseCommand):
    help = "Create or update the launch product catalogue."

    def add_arguments(self, parser) -> None:  # type: ignore[no-untyped-def]
        parser.add_argument(
            "--no-demo", action="store_true", help="skip the synthetic demo products"
        )

    def handle(self, *args: object, **options: object) -> None:
        rows = list(NIGERIAN_PRODUCTS) + ([] if options.get("no_demo") else list(DEMO_PRODUCTS))
        for slug, name, manufacturer, pack, sector in rows:
            Product.objects.update_or_create(
                slug=slug,
                defaults={
                    "display_name": name,
                    "manufacturer": manufacturer,
                    "pack": pack,
                    "sector": sector,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"catalogue: {len(rows)} products"))
