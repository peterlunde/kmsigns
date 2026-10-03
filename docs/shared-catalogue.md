# Shared catalogue

The shared catalogue is served as static files from `public/catalogue` on the existing Vercel deployment. No database, login, storage account or server credentials are required.

Users choose **Load Klättermusen catalogue** on the empty home screen or under **Import & share**. Packs are verified with SHA-256 and imported into local IndexedDB. Existing IDs, matching gender/style/name records, local edits, deleted products, settings and print queues are preserved. A failed import can be retried without duplicating products. Catalogue edits remain local to that browser.

The initial catalogue contains 213 products and the 129 available sets of talking points from Peter’s exported pack. Missing points retain their existing retrieval status; they can be edited or fetched in Product information. Images are WebP with alpha, up to 1800 pixels on the longest side, quality 90. They are stored directly without reprocessing the cutout. PDF export renders them normally.

## Publish a replacement catalogue

1. Export an approved pack from Studio via Import & share.
2. From the repository root, install Pillow if needed and run:

```sh
python3 scripts/build_catalogue.py "/path/to/Klattermusen-products.zip"
```

3. Commit the updated manifest and new versioned ZIP packs under `public/catalogue`. Deploy together.

New catalogue loads add missing products and preserve local edits. They do not force changes onto products already present. Existing versioned packs can be retained while earlier open tabs finish downloading. Shared updates are controlled through repository access; individual stores do not write to the shared catalogue.
