# Acceptance record

Checked locally on October 16, 2026, on an Apple M1 Max MacBook Pro with 64 GB RAM.

- All **10 physics/input tests pass** with Node 26 and Rapier 0.21.0.
- Production build succeeds. The ~5 MB client bundle includes the WebAssembly physics engine.
- The complete project, dependencies, and production build occupy approximately **85 MB**; `npm run check:size` enforces the 1 GB project budget.
- In the live Codex in-app browser, both default scenes reach **Landing complete** with the same rounded touchdown metrics as the headless checks.
- Changing lift thrust to zero updates the numeric field, slider, and custom-setup badge; the live browser then reports an underbody strike instead of success.
- Restoring the successful preset resets the controls and permits a successful run again.
- Orbit/follow cameras, playback speed, and scenario selection were exercised.
- Configuration download produced valid version-1 JSON; telemetry download produced a CSV with 487 data rows for the checked failed ramp run.
- The layout was inspected at a desktop width and at 417 px. The final narrow layout has no horizontal overflow.

The preview image shows the live app after its default kickflip completed. Downloads used only for smoke testing were removed. No real vehicle, nozzle-flow, structural-damage, or physical-landing validation was performed. Clipboard sharing and JSON upload were not exercised in browser acceptance.
