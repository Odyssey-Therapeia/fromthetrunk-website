# Legacy media and Blob cleanup

`pnpm run media:cleanup:report` is dry-run only. It inventories local public
assets, literal runtime references and compatibility paths. `--execute` is
intentionally refused. It does not list or delete Blob objects.

Current classifications:

- Eight packaging PNGs total 25,524,317 bytes. They remain referenced by the
  paused packaging chooser and are dormant-retain.
- `/Welcoming.mp4` and both newer MP4 candidates were removed from `public/`
  only after exact redirects to `/welcome-poster.avif` were added.
- `/Welcoming.webm` redirects to the bounded v2 WebM; retain evidence until
  production access logs confirm the old path is cold.
- Original founder/category images remain live on story/why paths.
- `/banner/collection_banner.png` is a reduced compatibility asset; retain.
- `seo-candidates`, zero-literal-reference files and prior generated assets are
  candidates pending CDN/referrer/backlink evidence, not deletion proof.
- Third-party Behold/Instagram URLs are not owned Blob objects and are excluded.

## Future Blob cleanup contract

The future command defaults to dry-run and takes an explicit environment,
sanitized DB fingerprint, Blob store fingerprint, bounded `media/` prefix and
immutable manifest path. Execution requires a separate explicit authorization,
exact identity confirmations and a long confirmation phrase. Production also
requires a distinct production phrase and fresh user authorization.

Its retain-set union must include every media asset, all derivative rows and
generations/statuses, product/collection relations, order-item image snapshots,
owned user images, CMS config/page/version/history JSON, themes, navigation,
redirect compatibility paths, rendered public API/sitemap/JSON-LD/OG/feed
outputs, Search Console/catalog/backlink evidence, and recent/in-flight work.
Missing external evidence means `unknown-retain`.

Candidate equation: complete paginated store inventory minus database refs
minus rendered-output refs minus compatibility refs minus external refs minus
in-flight refs. Require a cooling period. Fail closed on incomplete DB queries,
JSON parsing, pagination, HEAD checks or evidence sources.

Before deletion, write checksummed JSON and CSV manifests, obtain human review,
then re-read all references and HEAD the exact expected-host pathname/size to
avoid races. Use bounded batches, record each result, re-list afterward, never
delete DB rows in the same command, and never expand a resumed manifest's scope.
Blob deletion is destructive; backup/quarantine/restore policy must be decided
before any production approval.
