# genMC(P) — A shared canvas for humans and spatial AI

## One-line pitch

A Minecraft skin studio where people and agents work on the same pixels, with the same tools and a shared understanding of every body part.

## Inspiration

As models improve at visual and spatial reasoning, creative tools need more than a prompt box. They need a common workspace. A Minecraft skin is a surprisingly useful starting point: just 64 by 64 pixels, but wrapped around a body with multiple sides and a second clothing layer. GenMC gives both humans and agents the same precise map.

That same workspace could also become a benchmark for spatial reasoning. A model could be asked to continue a stripe around an arm, align a pattern across adjacent faces, or modify an outer sleeve while preserving the skin underneath. The fixed 2D-to-3D mapping makes these tasks small, repeatable and inspectable: we could measure target-region accuracy, continuity across face boundaries and unintended changes to other pixels.

Our motivation is to make improvements in visual and spatial reasoning observable through concrete creative tasks. Comparisons would hold starting skins, prompts, visual inputs and tool access constant, and distinguish following explicit UV coordinates from inferring spatial relationships across views. A standardized evaluation suite and comparative model results are future work; the studio provides the shared workspace on which to build them.

## What it does

People paint in 2D or directly on a 3D character, isolate body parts and clothing layers, inspect static or animated poses, import/export skins, and remix public templates. An agent can read the exact current skin and selection, discover all 72 semantic face regions, and apply bounded, atomic edits. Human corrections and agent operations use the same editing engine. Changes can be undone, and publication requires reviewing a fixed snapshot.

## Why WebMCP

A flat image alone does not tell an agent which pixels belong to the back of a slim left arm's outer sleeve. `get_uv_atlas` does. `get_skin_state` supplies current pixels and revision. `read_region` provides focused context. `apply_operations` edits semantic faces using local coordinates with conflict protection. This reduces brittle screen-coordinate guessing and makes precise collaboration possible.

The app registers nineteen imperative tools with `document.modelContext.registerTool`. Registration is feature-detected and scoped with AbortSignal. Tools share the React application's state and pure edit engine; they are not a disconnected demo endpoint. No model provider key is required by the website. A compact message queue attaches new user instructions and action events to tool responses. Read receipts show delivery, while explicit completion removes fulfilled requests. The agent can await `wait_for_user_action` to receive updates during the same turn; the page cannot interrupt model reasoning or start a new agent turn. Each skin has an isolated, persistent private session. Additive masks provide context; they restrict edits only when the user explicitly enables the boundary.

## Trust and provenance

Public exports carry a lightweight GenMC marker and retain template lineage. The marker is explicitly removable and forgeable. It is an origin hint, not universal AI detection, not proof of authorship, and not Google SynthID.

## Built with

Codex, React, Vinext, Three.js, native WebMCP, ChatGPT Sites, Cloudflare D1 and R2. Original programmatic skin assets. MIT license.

## What is next

The vision is GenMC as a shared creative workspace for Minecraft: skins first, then structure editing, texture packs and eventually mods. These are future directions, not capabilities claimed in this submission.

## Judge walkthrough

1. Open the live app in a WebMCP-capable browser, such as Codex's in-app browser used in our native local test.
2. Ask: "Read the current skin and its UV atlas. Add a small gold emblem to body.overlay.front. Preserve all other pixels."
3. Inspect the visible edit; undo and redo it.
4. Select an arm in 3D, change pose or start animation, switch to the 2D map.
5. Open Gallery and remix a starter. Publish only after reviewing the dialog.
6. Export the finished PNG with its GenMC marker.

Live URL: https://genmc-studio.kolio.chatgpt.site

Public repository: https://github.com/HamerJava/genmc-studio

Video: paste the public YouTube URL of the owner's newly recorded demo here before submission. The recording has not been provided for verification in this preparation pass.

Submission status: materials prepared; no Devpost submission or acceptance is implied. Confirm eligibility, deadline, team details, public repository URL and YouTube URL on the current submission form.
