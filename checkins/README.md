# GLB check-in publishing

**One action:** update `glb.json` on the `main` branch (normally via the existing GLB editor). A GitHub Actions workflow then automatically publishes a new source-backed edition.

- **Archive:** [Video Archive](https://captainpwilly.github.io/willy-dex/checkins/index.html).
- **Newest edition:** [Latest Check-In](https://captainpwilly.github.io/willy-dex/checkins/latest.html).
- **Permanent MP4 download:** Each edition's **Download MP4** button links to its GitHub Release asset, not a ChatGPT attachment.
- **Trigger:** `.github/workflows/publish-glb-checkins.yml` runs on every `main` update to `glb.json`; it can also be launched manually from the Actions page.
- **Generation:** `node scripts/generate-glb-checkins.cjs` validates the data, freezes a copy and player under `checkins/editions/<edition-id>/`, and updates `checkins/manifest.json`.
- **Rendering:** `node scripts/render-glb-checkin.cjs <edition-id>` records the original canvas presentation and soundtrack and encodes a 720×1280 H.264/AAC MP4 with FFmpeg. GitHub Releases store the large video files, while GitHub Pages serves the catalog and HTML players.
- **History:** Editions are content-addressed (full snapshot JSON hash) and never silently overwritten. Re-running the same GLB data does not duplicate a catalog entry. Changes to data create a different edition even if the timestamp is unchanged.
- **Integrity:** Recorded ranks and exact endpoint XP values are used. Bar motion is illustrative between captures; it is not an extra data point. Missing or malformed GLB snapshots cause publishing to fail instead of generating invented statistics.
- **YouTube:** Videos are downloadable and ready for manual upload as Shorts. This workflow intentionally **does not** publish to YouTube or log into a YouTube account.

If an edition is absent, inspect the [publishing workflow](https://github.com/CaptainPWilly/willy-dex/actions/workflows/publish-glb-checkins.yml) and rerun it after addressing the error. The archive is committed only after MP4 publication succeeds.
