# Runbook: make a catalogue product scannable

The catalogue preloads seven Nigerian products (CWAY Table Water 75cl, Gala Sausage Roll, Minimie
Chinchin, Indomie Chicken 70g, Peak Evaporated Milk 160g, Milo 20g sachet, Emzor Paracetamol
500mg). Each shows as **reference pending** in the scanner until a baseline signature exists: the app
refuses to give a verdict for it rather than guessing.

## Steps

1. `make up`, then open the OEM portal: http://localhost:3000/oem/login on the Mac, or
   `https://<mac-ip>/oem/login` on a phone after `make https` (the camera needs HTTPS).
   Dev accounts: `oem@example.com` / `oem12345` or `admin@example.com` / `admin12345`.
2. Choose the product, then add **at least 5 photos** (10–20 recommended) of a **genuine** item:
   - **Take photos** (best, on the phone): each tap on _Add photo_ adds one frame, framed exactly the
     way the scanner frames a capture.
   - **Choose from device**: pick photos from the gallery or the Mac; you can pick several at once or
     one at a time, they add up. Each is centre-cropped and resized to match the scanner.
     Photograph the same printed area every time (e.g. the brand panel), 5–10 cm away, even light,
     no glare, slight angle changes between shots. Remove bad shots with ×.
3. The hint under the photos says how many more are needed; the button enables at 5.
   **Upload and generate reference** starts the worker job: `pending → running → ready`
   (the status table refreshes every 5 s).
4. Open `/scan` on a device that is online once. The picker calls `GET /api/v1/products/`, stores the
   new signature in IndexedDB, and the product loses its "reference pending" suffix. From then on it
   scans offline.

## Adding a product to the catalogue

Django console (`/django-admin/`) → _OEM registration & baselines → Products_, or add a row to
`apps/api/oem/catalogue.py` and `apps/web/public/catalogue/v1/products.json` (the static file keeps
the picker populated on a first load with no connectivity) and run
`docker compose exec api python manage.py seed_products`.

## Caveat

The bundled model (v1.0.0) was trained on synthetic textures only. Enrolment works mechanically for
real packaging, but verdict quality on real products is untested until the model is retrained on
real captures (`make ml-manifest ml-train ml-export ml-baselines ml-evaluate`).
