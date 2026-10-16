# Model, presets, and evidence

## Scope

This sandbox reconstructs the **sequence** visible in Tesla’s official ramp and kickflip clips. It is useful for exploring the effect of assumed vehicle/actuator parameters. It is not a calibrated aerodynamic, structural, or Tesla vehicle model.

Primary visual sources:

| Scene    | Source                                                                | Observable sequence                                                                                        |
| -------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Ramp     | [Tesla — The Ramp](https://www.youtube.com/watch?v=7p5LxFdc-Qg)       | Driven overhung ramp, near-inverted release, rotation upright, jet-assisted descent, wheels-down touchdown |
| Kickflip | [Tesla — The Kickflip](https://www.youtube.com/watch?v=r5vsHHPVhJg)   | Flat-pad launch, longitudinal roll over five parked vehicles, landing beyond the lineup                    |
| Event    | [Tesla — Roadster Event](https://www.youtube.com/watch?v=qt5p-_tE8d0) | Tesla’s ramp chapter begins 6:03; kickflip 10:56; aero 14:38                                               |

The parked vehicles are perpendicular to the flight path, so the car crosses their widths. Their dimensions here are approximate bounding volumes. There are no imported Tesla CAD assets or extracted video frames.

## Assumed default values

All numbers in this table are model inputs, not measurements of Tesla’s demo.

| Parameter                           |          Ramp | Kickflip |
| ----------------------------------- | ------------: | -------: |
| Initial loaded mass (including air) |       1800 kg |  1800 kg |
| Launch speed                        |        12 m/s |   18 m/s |
| Ramp height / target rise           |          20 m |    7.5 m |
| Ramp exit tangent                   |          135° | Not used |
| Target flight duration              |         5.6 s |    4.2 s |
| Target rotation duration            |         1.6 s |    3.0 s |
| Lift force request limit            |         42 kN |    42 kN |
| Attitude torque request limit       |       24 kN·m |  24 kN·m |
| Exhaust-air speed limit             |       500 m/s |     Same |
| Rated aggregate mass flow           |      120 kg/s |     Same |
| Initial tank pressure               | 350 bar gauge |     Same |
| Tank internal volume                |         800 L |     Same |
| Initial usable air                  |       ~333 kg |     Same |
| Initial available jet thrust        |         60 kN |     Same |
| Auto throttle                       |           Off |      Off |
| Spring rate per wheel               |       40 kN/m |     Same |
| Damper per wheel                    |    4.5 kN·s/m |     Same |
| Compression travel                  |        0.26 m |     Same |
| Ground friction coefficient         |           0.9 |     Same |
| Drag coefficient × frontal area     |       0.65 m² |     Same |
| Runway wind                         |         0 m/s |     Same |

The chassis is 4.5 × 1.95 × 0.62 m, with 2.7 m wheelbase, 1.65 m track, and 0.34 m wheel radius. A uniform cuboid approximates its principal inertias. Geometry and inertia are simplified; cockpit artwork does not alter the collision shape.

Four assumed nozzles sit at body coordinates `(x, y, z) = (±1.25, -0.37, ±0.64) m`. Body +X points toward the nose, +Y toward the roof, +Z to the left. Both successful presets enable all four with unrestricted assisted steering, zero direction trims, 100% valve limits, and firing windows from 0 to 8 seconds after release. These windows permit the controller to fire; assisted nozzles do not run at full power throughout them.

The tank uses fixed ideal-air assumptions: 293.15 K, gas constant 287.05 J/(kg·K), heat-capacity ratio 1.4, and ambient pressure 101325 Pa. The ideal regulator caps nozzle inlet pressure at **100 bar absolute**. All displayed tank pressures are **bar gauge**. The chosen 800 L tank, flow capacity, mass, and steering are illustrative; vehicle packaging and pressure-vessel strength are not evaluated.

## Coordinates and integration

- SI units throughout. X follows the runway, Y points up, Z runs across the runway.
- Rapier uses a fixed 1/240 s step. Render rate and playback speed do not change that step.
- The driven approach and ramp adhesion prescribe the chassis pose. No suction, tire traction, or traction limit is calculated on the ramp.
- At release, the body becomes dynamic with the ramp-tangent launch velocity. Kickflip release starts at ground level with zero vertical velocity; lift forces cause takeoff.
- Gravity is 9.81 m/s²; air density is fixed at 1.225 kg/m³.
- Drag is `F = -0.5 * rho * CdA * |v_air| * v_air`.
- Chassis colliders detect contact with ground, the ramp, and the parked vehicles. Continuous collision detection is enabled.

## Flight control

The ramp altitude reference is a cubic Hermite curve matching release height/vertical velocity and the desired touchdown height/velocity. The kickflip uses two quintic smoothstep segments to rise to the selected height and descend. These define the nominal flight plan, rather than imposing positions on the dynamic chassis.

**Preset lift programme is the default.** The model first prepares nominal collective lift commands at 240 Hz using the default vehicle, supply, and nozzles for the selected speed, height, exit angle, flight duration, and rotation duration. It retains only the latest command programme per scene. Recorded values are force commands, not vehicle positions or a replayed trajectory.

During the actual run, lift is `clamp(nominal_command(t) * current_supply_capacity / nominal_supply_capacity, 0, lift_request_limit)`. Thus the same nominal valve demand produces more thrust with more flow or exhaust speed, and less thrust when pressure limits delivery. Supply, vehicle mass, nozzle, and environment edits do not cause a new programme to be fitted around those changes. There is no altitude-error feedback in this mode to cancel them. The body still responds to integrated gravity, jet forces, drag, and contact; extra thrust can cause an overshoot and a harder eventual landing. Attitude assistance remains independently selectable.

**Auto throttle is an explicit alternative.** It requests `m * (g + reference_acceleration + 11 * height_error + 6.5 * vertical_velocity_error)`, limited to `[0, lift_request_limit]`. Mass `m` decreases as air is expelled. This mode adjusts valves to hold the target path; a higher flow rating can be exactly compensated by a smaller valve opening when capacity is sufficient. Flow is then a capability limit, rather than a direct instruction to expel more air. Both modes request a world-up force that is transformed to body coordinates and allocated to the four nozzles.

Attitude control tracks a quaternion reference with a proportional/damping torque request. The ramp target rotates from the exit attitude to an upright car facing back along the runway. The kickflip target completes one longitudinal roll. The request is capped at the selected torque norm. There is **no separate torque actuator**: actual rotation must come from nozzle forces at their moment arms.

### Nozzle allocation and manual firing

For the symmetric four-corner layout, the mixer assigns each nozzle one quarter of the requested force, plus differential forces to supply the requested torque. It accounts for the mounting plane's offset from the center of mass. In body coordinates:

```text
r_mean = mean(nozzle_position - COM)
r_i = nozzle_position_i - COM - r_mean
D = sum(|r_i|² I - r_i r_iᵀ)
w = inverse(D) * (requested_torque - r_mean × requested_force)
F_i = requested_force / 4 + w × r_i
```

Each assisted nozzle takes the opposite vector as its exhaust direction, applies its user-selected direction trims, and clamps force to its individual flow/speed/valve capacity. The four shares are computed before closed valves and saturation; unavailable capacity is not redistributed by an optimizer. Disabling a nozzle, shortening its window, or trimming it can spoil the maneuver. Attitude control responds through feedback; altitude correction occurs only in Auto throttle mode. Neither can add any hidden force or torque.

Choose **Fixed to car** to bypass automatic steering and fire that nozzle at its selected valve percentage during its window. Both assistance switches can be off while fixed nozzles still fire. At zero angles its exhaust points along body -Y. Angles rotate the exhaust first about -X (side), then +Z (fore/aft). With the other angle zero, +90° side points exhaust left (+Z), and +90° fore/aft points it toward the nose (+X). Thrust points the opposite way. In assisted mode these same rotations trim the automatic body-frame exhaust direction; zero angles leave it unchanged. Ideal steering has no gimbal angle or rate limits.

Windows are half-open `[start, start + duration)` in **seconds since free-flight release**; the runway approach and ramp travel do not consume them or air. The fixed 240 Hz step resolves timing to approximately 4.17 ms. Duration zero, disabled valves, or zero valve settings produce no force. The plume and nozzle artwork follow each nozzle's actual body-frame exhaust direction and output.

### Finite tank, pressure, and thrust

The model uses the ideal gas relation `P V = m R T`. Tank volume and temperature are constant. Initial loaded vehicle mass includes all tank air; expelled air is subtracted from both tank and vehicle mass. Gas remaining at ambient pressure is retained and cannot produce further thrust. Center of mass is held fixed and chassis inertia scales uniformly with the remaining loaded mass, rather than solving internal gas motion or tank placement.

The user-selected **full-valve mass flow** defines four equal ideal valve capacities at 100 bar absolute. The actual inlet is `P_in = min(P_tank, 100 bar absolute)`. Above the regulator setting, more tank pressure adds air reserve without increasing initial flow. Below it, flow scales with inlet pressure. Above the critical pressure ratio it is choked; near ambient it uses the subsonic isentropic orifice relation and falls to zero:

```text
r = P_ambient / P_in
r_critical = (2 / (gamma + 1))^(gamma / (gamma - 1))
phi_choked = sqrt(gamma) * (2 / (gamma + 1))^((gamma + 1) / (2(gamma - 1)))
phi = phi_choked                                 if r <= r_critical
phi = sqrt(2 gamma / (gamma - 1) * (r^(2/gamma) - r^((gamma+1)/gamma))) otherwise
max_flow_total = rated_flow * (P_in / P_reference) * phi / phi_choked
```

The user-selected exhaust speed is an upper limit, capped by an ideal expansion to ambient:

`v_exhaust = min(speed_limit, sqrt(2 gamma/(gamma-1) R T [1 - (P_ambient/P_in)^((gamma-1)/gamma)]))`

Exit pressure is assumed matched to ambient, so each jet's reaction force is `F = mass_flow × v_exhaust`. Actual flow follows the requested force, with valve percentage limiting each nozzle to its share. The last step scales all jets if insufficient usable air remains. Zero flow rating, exhaust speed, or gauge pressure removes both lift and rotation.

These relations follow [NASA's thrust equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-thrust-equation/), [compressible mass flow](https://www.grc.nasa.gov/www/k-12/BGP/mflchk.html), [isentropic relations](https://www.grc.nasa.gov/www/k-12/airplane/isentrop.html), and [ideal-gas equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/equation-of-state/), with the simplifying assumptions above. They do not solve a fixed nozzle geometry. Flow rating and the speed limit represent independently adjustable effective valve/nozzle characteristics. There is no CFD, adiabatic tank cooling, real-gas correction, regulator dynamics, plumbing loss, pressure mismatch term, ground effect, nozzle/body interference, or pressure-vessel analysis. An isothermal tank can overestimate sustained performance during a rapid discharge.

## Suspension and landing

Four wheel locations are transformed with the chassis pose. Each wheel can supply a compressive ground force when the body is sufficiently upright:

`normal_force = max(0, k * penetration + 6k * excess_travel - c * vertical_contact_velocity)`

The excess-travel term is a progressive bump-stop/tire approximation. Compression is measured vertically for force calculation; displayed wheel movement projects the compression along the suspension direction. Friction opposes contact-point velocity and is limited to `mu * normal_force`. These are point contacts against the flat runway, not detailed tires, unsprung masses, or suspension linkage models. The parked-vehicle collision shapes are intentionally conservative boxes.

The altitude force request turns off at first touchdown. Attitude assist can continue for 0.25 s. Manually fixed nozzles continue according to their own windows. The car settles and decelerates through the wheel model.

A completed run requires:

1. The vehicle became airborne and avoided chassis collisions.
2. First wheel touchdown below 4 m/s downward velocity and 22° tilt.
3. At least three supporting wheels and vertical speed within ±0.25 m/s.
4. Forward speed below 0.8 m/s, at least 1 s after touchdown.
5. For the kickflip, at least 0.95 accumulated turns about world X and landing beyond the last vehicle.

These are explicit sandbox criteria, not Tesla specifications or safety standards. “Peak wheel support” is the modeled sum of wheel forces divided by vehicle weight. It does not represent occupant acceleration or certified peak impact loading.

## Verification

`npm test` checks successful defaults for both scenes; actual trajectory changes with airflow and exhaust-speed edits; compensation only in explicit Auto throttle mode; flow/speed/pressure limits; tank and rigid-body mass conservation; nozzle force and moment balance; direction, valve, and timing effects; the final gas step; incomplete-kickflip detection; insufficient lift; unpowered vertical acceleration; repeatability; setup round trips and legacy conversion; and rejected invalid parameters. Tests use the same physics and propulsion modules as the browser.

The [parameter effect audit](PARAMETER_AUDIT.md), regenerated with `npm run audit:parameters`, checks all **99 exposed physics settings across the two scenes** against integrated motion or landing forces. It includes every field on every nozzle, schema coverage checks, and 20 cases where an inactive limit or dependency must leave motion unchanged. The full suite contains 149 tests. A control can affect a flight without changing its final success/failure label; rotation duration primarily changes airborne attitude, while damping and friction can primarily change touchdown and settling. Raising an unused ceiling does not create force. Camera and playback choices do not alter the fixed physics step.

Default smoke results on the development Mac (M1 Max, Node 26, Rapier 0.21.0):

| Scene    | Outcome  | Touchdown downward speed | Peak wheel support | Air consumed | Final tank pressure | Kickflip turns |
| -------- | -------- | -----------------------: | -----------------: | -----------: | ------------------: | -------------: |
| Ramp     | Complete |                ~1.39 m/s |     ~1.81 × weight |    ~164.0 kg |        ~177.5 bar g | Not applicable |
| Kickflip | Complete |                ~1.42 m/s |     ~1.83 × weight |    ~132.4 kg |        ~210.8 bar g |         ~1.000 |

With the same default kickflip plan and Preset lift programme, changing only full-valve flow gives:

| Flow rating | Peak rise | Outcome                    |
| ----------: | --------: | -------------------------- |
|     90 kg/s |    ~2.5 m | Strikes the semi           |
|    120 kg/s |    ~7.5 m | Stable landing             |
|    150 kg/s |   ~21.2 m | Overshoot and hard landing |

These cases were identical at 90–150 kg/s in the earlier implicit auto-throttle implementation. The regression tests now require a change in actual trajectory, not merely an updated capacity readout or a zero-flow failure.

JSON setups and share links use version 2 and include the full supply and all four nozzle records. Loading version 1 converts its former impulse budget to an equivalent usable air mass at the default speed and tank pressure and visibly reports the migration; results can change. Invalid or physically impossible loaded-mass/tank combinations fail explicitly. CSV columns include SI force, torque, flow and mass, gauge pressure in bar, and each nozzle's thrust, flow, and body-frame exhaust vector. Nozzle indices 1–4 are front left, front right, rear left, rear right.

These values demonstrate computational behavior of this model. They are not validation against the physical Tesla vehicle. JavaScript/WASM results may vary slightly across runtimes; the selected Rapier package does not promise cross-platform bitwise determinism.
