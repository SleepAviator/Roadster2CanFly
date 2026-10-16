# Roadster2CanFly

A small browser flight lab inspired by Tesla’s Roadster ramp and kickflip demonstrations. Recreate the sequence, adjust the physics, and see whether the car still lands.

**Two successful default presets. A static website. No simulation server.** Runs on an Apple Silicon Mac in a WebGL 2-capable browser. All artwork is generated in code, so no car models, textures, or video downloads are needed.

![Flight lab with a completed kickflip](docs/preview.jpg)

## Live demo

The live GitHub Pages demo is **[sleepaviator.github.io/Roadster2CanFly/](https://sleepaviator.github.io/Roadster2CanFly/)**.

The [publish workflow](.github/workflows/pages.yml) tests, builds, and deploys the site automatically on pushes to `main`. It can also be run manually from GitHub Actions. The workflow builds with `--base=/Roadster2CanFly/` so assets load at the repository URL; local development continues to use the root path. Only the built `dist/` website is deployed.

## Run on your Mac

Use Node.js 22.12+ (or a newer supported Node release).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173/`. Click **Run demo**. Use **Orbit**, **Follow**, or **Side** to inspect the stunt, and select slow motion to see the landing. Space pauses/resumes when focus is outside a control; R resets.

```sh
npm test          # physics and parameter validation
npm run audit:parameters  # regenerate the per-control sensitivity report
npm run build    # produces the standalone static website in dist/
npm run preview  # serves the production build locally
npm run check:size
```

The size check enforces a **1 GB project budget**, including source, installed dependencies, and the production build, excluding `.git`. Browser/OS storage and exported user files are separate. The deployed site contains only `dist/`; `node_modules/` is not deployed. Dependencies are pinned and locked.

## What you can change

- **Flight:** launch speed, ramp or jump height, ramp exit angle, target flight time, rotation duration.
- **Cold-air supply:** exhaust-air speed, full-valve mass flow, initial tank pressure, and tank volume. Live telemetry shows pressure, actual flow and exhaust speed, remaining usable air, and peak rise.
- **Thrust control:** the default **Preset lift programme** keeps nominal lift valve demand fixed, so airflow and exhaust-speed edits change thrust and trajectory. **Auto throttle** is a separate option that adjusts valve opening to hold the target path; increasing spare capacity in that mode may leave the flight unchanged.
- **Individual nozzles:** select any of four corner nozzles, adjust two exhaust angles, enable/disable it, set its valve limit, and schedule its firing start and duration. Times start at free-flight release. Assisted steering uses angle trims; fixed mode fires along the chosen car-relative direction.
- **Vehicle and control:** initial loaded mass, center of mass, lift request limit, and attitude torque request limit.
- **Landing:** spring stiffness, damping, suspension travel, friction.
- **Environment:** drag area and wind along the runway.
- **Assistance:** independently enable collective lift and attitude control.

Changes reset the simulation. **Restore successful preset** returns the current scene to its tested defaults. Save/load a version-2 JSON setup or copy a URL containing the full setup, including every nozzle. Version-1 setups are explicitly converted from their impulse budget to an equivalent usable air mass; results can differ under the new model. Export the run’s telemetry as CSV, including tank state, forces, and individual nozzle flows and exhaust directions.

Every exposed physics setting has an automated case that changes actual motion or landing forces: **50 settings for the ramp and 49 for the kickflip**, including all seven settings on each nozzle. Some ranges intentionally leave the flight unchanged: extra tank reserve, unused force/valve limits, excess suspension travel, and firing time after assisted demand ends. Camera and playback controls affect presentation. See the [complete parameter effect audit](docs/PARAMETER_AUDIT.md) for the tested values and measured effects, including 20 expected unchanged cases.

## What “recreate” means here

The night runway, overhung ramp, airborne recovery, five-vehicle lineup, roll, and landing follow the visible sequence in Tesla’s official clips:

- [The Ramp](https://www.youtube.com/watch?v=7p5LxFdc-Qg)
- [The Kickflip](https://www.youtube.com/watch?v=r5vsHHPVhJg)
- [Roadster Event](https://www.youtube.com/watch?v=qt5p-_tE8d0), October 15, 2026: ramp chapter at 6:03, kickflip at 10:56.

**The defaults are tuned assumptions, not Tesla engineering specifications or an independently validated reconstruction.** Tesla’s clips include edits/replays and do not supply calibrated trajectory, mass, thrust, or suspension data. The model does not test the real car’s safety or establish that Tesla used the assumed actuation system.

The driven approach and adhesion to the overhung ramp are prescribed. After release, Rapier integrates a rigid chassis at **240 Hz**. Four spring-damper wheel contacts handle landing support and friction. Four nozzle point forces produce both lift and rotation, consume air from a finite tank, and reduce vehicle mass. Pressure limits available flow and exhaust speed. Parameter changes can cause collisions, insufficient lift, hard landings, or an incomplete stunt.

The successful presets assume **ideal unrestricted nozzle steering**, an **isothermal ideal-air tank**, and a **100 bar absolute regulator**. The flow rating is the combined four-valve capacity at that regulator pressure; lower pressure reduces it. Exhaust speed is capped by ideal expansion to ambient. The 800 L / 350 bar gauge tank and all other engineering values are illustrative assumptions, not Tesla hardware specifications. This is a lightweight reduced model, not CFD or a pressure-vessel design tool.

For example, the default kickflip rises about **7.5 m at 120 kg/s**. With the same lift programme, **90 kg/s** reaches only about **2.5 m** and strikes the vehicle lineup; **150 kg/s** rises about **21.2 m** and lands hard. The nominal programme is prepared for the selected flight plan at the default hardware settings. Editing the air supply, vehicle mass, nozzles, or environment does not retune it to cancel those changes. The runway approach and ramp travel remain prescribed.

See [the model and its assumptions](docs/MODEL.md) for equations, defaults, criteria, and limitations.

## Project layout

```text
src/config.js       Parameter schema, presets, and scene dimensions
src/propulsion.js   Finite air supply and individual nozzle forces
src/simulation.js   Physics, controllers, contact, and outcomes
src/scene.js        Procedural Three.js artwork and cameras
src/main.js         Controls, playback, configuration, and CSV export
src/style.css       Responsive interface
tests/              Repeatable physics acceptance tests
scripts/            Project-size check and parameter sensitivity audit
docs/               Model documentation
```

Stack: [Three.js](https://threejs.org/), [Rapier](https://rapier.rs/), plain JavaScript, and Vite. No analytics, accounts, external model requests, or cloud computation. The reference videos open on YouTube only when selected.

Independent fan project, not affiliated with or endorsed by Tesla or SpaceX. Vehicle and scene artwork are original procedural approximations.
