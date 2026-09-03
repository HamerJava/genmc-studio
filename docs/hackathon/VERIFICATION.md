# Verification — 4 September 2026

## Passed

- Production build and TypeScript check.
- Six automated tests covering Classic/Slim atlas coverage, all 72 regions, asymmetric pixel addresses, atomic edits, revision conflicts, base transparency, marker behavior and canonical PNG encoding.
- Native WebMCP discovery and invocation in Codex's in-app browser, locally and on the public Sites origin. No injected modelContext mock was used.
- Local: every one of the twelve tools invoked with representative inputs; stale-revision rejection; undo/redo; template copy/read; publication preview.
- Public: get_skin_state, get_uv_atlas, set_selection, apply_operations, read_region, set_view and prepare_publish. Eight gold pixels added to body.overlay.front through native tool calls.
- Direct pointer painting in the 3D viewer changed one pixel and advanced the same state read through WebMCP.
- Local and public publication through the visible dialog; public record readable from a separate unauthenticated HTTP request.
- Published PNG downloaded and uploaded to the public checker: GenMC marker found.
- Responsive UI inspected at 1440×900 and 390×844; page width equaled viewport width on mobile.
- Public GitHub repository exposes MIT license; public app returns HTTP 200 without authentication.

## Limits

- No actual Minecraft client round-trip was tested; PNG validity and internal UV correspondence were tested.
- Java profile providers can reject datacenter traffic or be unavailable. The UI reports this without inferring whether a skin is AI-generated. The service uses official Minecraft Services and Mojang, with the documented public Ashcon profile cache as a labeled fallback.
- Draft is one anonymous browser-session document; concurrent multi-tab editing is not coordinated server-side. Clearing the browser cookie loses access.
- Marker is removable and forgeable; it is only an export-origin hint.
- Demo is a narrated walkthrough assembled from actual public app captures and verified native tool actions, not an uncut screen recording. Voice is synthetic. Video has English subtitles.
- No YouTube upload or Devpost submission has been made.

## Submission reference

Current Devpost overview checked on 4 September 2026: https://webmcp.devpost.com/
It displays 4 September 2026 at 1:00am PDT (10:00am Europe/Berlin). Older rules/resources differ; confirm the active form before submitting. A public YouTube demo under three minutes with audio, public source repository and live URL are required.

## September 4 editor update

Eight local automated tests pass, including sparse mixed-author history persistence and mask/context conflict checks. TypeScript and production build pass. Native local WebMCP retrieved a user-entered brief and a painted mask at body.overlay.bottom, performed an in-mask edit, rejected an out-of-mask edit, and read both agent and manual 3D stroke history. Undo/redo and draft reload retained the context and history. The live browser visually verified moving walk poses, agent edge glow, and the raised violet overlay grid. The previous demo video predates these additions.
