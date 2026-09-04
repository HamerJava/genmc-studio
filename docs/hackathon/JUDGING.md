# Judge testing instructions

Live app: https://genmc-studio.kolio.chatgpt.site

Source: https://github.com/HamerJava/genmc-studio (MIT)

No account or AI provider key is required by the website. Use a WebMCP-capable browser and your external agent. Ordinary browsers still support manual editing. The agent panel should show that the agent is available; browser-extension connectivity alone is not evidence of WebMCP support.

## Short walkthrough

1. Open the app and ask the agent: “Read the current skin and UV atlas. Create a new private skin named Judge demo, then fetch its tools and state again.”
2. Ask: “Add a gold emblem to body.overlay.front. Preserve every other pixel. Read the current edit context before applying the change.”
3. Verify the visible 3D result. Switch to 2D, undo and redo. Both paths operate on the same canonical pixels and history.
4. Draw two separate masks. Both remain visible. Leave **Stay inside marks** off to use them as references, not mandatory boundaries.
5. While the agent is active, send “Make the emblem light blue instead” through the page's message bar. It is queued, then marked Read when delivered by a tool response. Ask the agent to complete that request explicitly after performing it; the message disappears.
6. Ask the agent to call `export_skin_images` and display the perspective image. This does not publish anything.
7. Export a PNG or open the publication preview. Publication occurs only after a person confirms the visible dialog; publishing is not necessary for testing.

## Useful contract details

- Begin with `get_skin_state`, `get_uv_atlas` and `get_edit_context`.
- Use the returned session ID and pixel/context revisions, not hard-coded values.
- A session switch invalidates old tool handles; fetch them again.
- `wait_for_user_action` waits for page feedback for up to 25 seconds. Repeat it during live collaboration; a timeout is not user approval or completion.
- `complete_requests` removes only fulfilled message IDs. Reading alone is not completion.
- The site cannot wake an agent whose external conversation has ended.
- Private drafts use a browser cookie. Clearing it loses access; exports are recommended. Avoid concurrent edits in multiple tabs.

The marker in exported PNGs is a removable provenance hint, not proof of authorship or general AI detection. Actual Minecraft client import has not been verified in this handoff.
