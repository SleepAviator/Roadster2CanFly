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

| Parameter                       |                            Ramp | Kickflip |
| ------------------------------- | ------------------------------: | -------: |
| Mass                            |                         1800 kg |  1800 kg |
| Launch speed                    |                          12 m/s |   18 m/s |
| Ramp height / target rise       |                            20 m |    7.5 m |
| Ramp exit tangent               |                            135° | Not used |
| Target flight duration          |                           5.6 s |    4.2 s |
| Target rotation duration        |                           1.6 s |    3.0 s |
| Maximum lift thrust             |                           42 kN |    42 kN |
| Maximum attitude torque         |                         24 kN·m |  24 kN·m |
| Shared actuation budget         | 6 equivalent full-power seconds |     Same |
| Spring rate per wheel           |                         40 kN/m |     Same |
| Damper per wheel                |                      4.5 kN·s/m |     Same |
| Compression travel              |                          0.26 m |     Same |
| Ground friction coefficient     |                             0.9 |     Same |
| Drag coefficient × frontal area |                         0.65 m² |     Same |
| Runway wind                     |                           0 m/s |     Same |

The chassis is 4.5 × 1.95 × 0.62 m, with 2.7 m wheelbase, 1.65 m track, and 0.34 m wheel radius. A uniform cuboid approximates its principal inertias. Geometry and inertia are simplified; cockpit artwork does not alter the collision shape.

## Coordinates and integration

- SI units throughout. X follows the runway, Y points up, Z runs across the runway.
- Rapier uses a fixed 1/240 s step. Render rate and playback speed do not change that step.
- The driven approach and ramp adhesion prescribe the chassis pose. No suction, tire traction, or traction limit is calculated on the ramp.
- At release, the body becomes dynamic with the ramp-tangent launch velocity. Kickflip release starts at ground level with zero vertical velocity; lift forces cause takeoff.
- Gravity is 9.81 m/s²; air density is fixed at 1.225 kg/m³.
- Drag is `F = -0.5 * rho * CdA * |v_air| * v_air`.
- Chassis colliders detect contact with ground, the ramp, and the parked vehicles. Continuous collision detection is enabled.

## Flight control

The ramp altitude reference is a cubic Hermite curve matching release height/vertical velocity and the desired touchdown height/velocity. The kickflip uses two quintic smoothstep segments to rise to the selected height and descend.

Lift control requests `m * (g + reference_acceleration + 11 * height_error + 6.5 * vertical_velocity_error)`, limited to `[0, maximum_thrust]`. **Lift is an ideal vectorable world-up resultant.** It is not a set of fixed body-mounted nozzle directions. The plume rendering follows this assumption.

Attitude control tracks a quaternion reference with a proportional/damping torque request. The ramp target rotates from the exit attitude to an upright car facing back along the runway. The kickflip target completes one longitudinal roll. Torque is capped at the selected norm.

Actuation consumes equivalent full-power lift time:

`budget_used += (lift_force + |attitude_torque| / 1.5 m) / maximum_lift_force * dt`

The final step is scaled to the remaining budget. This is an impulse proxy. It does not model pressure, tank mass depletion, gas temperature, nozzle expansion, or a real cold-gas system. Setting lift cap or budget to zero removes all modeled actuation.

## Suspension and landing

Four wheel locations are transformed with the chassis pose. Each wheel can supply a compressive ground force when the body is sufficiently upright:

`normal_force = max(0, k * penetration + 6k * excess_travel - c * vertical_contact_velocity)`

The excess-travel term is a progressive bump-stop/tire approximation. Compression is measured vertically for force calculation; displayed wheel movement projects the compression along the suspension direction. Friction opposes contact-point velocity and is limited to `mu * normal_force`. These are point contacts against the flat runway, not detailed tires, unsprung masses, or suspension linkage models. The parked-vehicle collision shapes are intentionally conservative boxes.

Lift control turns off at first touchdown. Attitude assist can continue for 0.25 s. The car settles and decelerates through the wheel model.

A completed run requires:

1. The vehicle became airborne and avoided chassis collisions.
2. First wheel touchdown below 4 m/s downward velocity and 22° tilt.
3. At least three supporting wheels and vertical speed within ±0.25 m/s.
4. Forward speed below 0.8 m/s, at least 1 s after touchdown.
5. For the kickflip, at least 0.95 accumulated turns about world X and landing beyond the last vehicle.

These are explicit sandbox criteria, not Tesla specifications or safety standards. “Peak wheel support” is the modeled sum of wheel forces divided by vehicle weight. It does not represent occupant acceleration or certified peak impact loading.

## Verification

`npm test` checks successful defaults for both scenes, zero-thrust failures, insufficient-lift failure, budget exhaustion, incomplete-kickflip detection, unpowered vertical acceleration, same-runtime replay repeatability, and rejected invalid parameters. Tests use the same physics module as the browser.

Default smoke results on the development Mac (M1 Max, Node 26, Rapier 0.21.0):

| Scene    | Outcome  | Touchdown downward speed | Peak wheel support | Kickflip turns |
| -------- | -------- | -----------------------: | -----------------: | -------------: |
| Ramp     | Complete |                ~1.39 m/s |     ~1.76 × weight | Not applicable |
| Kickflip | Complete |                ~1.42 m/s |     ~1.78 × weight |         ~1.000 |

These values demonstrate computational behavior of this model. They are not validation against the physical Tesla vehicle. JavaScript/WASM results may vary slightly across runtimes; the selected Rapier package does not promise cross-platform bitwise determinism.
