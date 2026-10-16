import "./style.css";
import { DEFAULTS, PARAM_GROUPS, SOURCES, parametersFor } from "./config.js";
import { FlightSimulation, initializePhysics, STEP } from "./simulation.js";
import { SceneView } from "./scene.js";

const $ = (id) => document.getElementById(id);
const phaseNames = {
  ready: "Ready for launch",
  approach: "Runway approach",
  ramp: "Climbing the overhang",
  flight: "Free flight",
  landing: "Touchdown & settling",
  complete: "Landing complete",
  crashed: "Flight ended",
};
let mode = "ramp";
let parameters = parametersFor(mode);
let simulation, view;
let playing = false,
  accumulator = 0,
  lastFrame = null,
  noticeTimer;

function notify(message, error = false) {
  $("notice").textContent = message;
  $("notice").classList.toggle("error", error);
  $("notice").classList.remove("hidden");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(
    () => $("notice").classList.add("hidden"),
    error ? 6500 : 3000,
  );
}

function readSetup(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Setup must be a JSON object.");
  if (value.version !== 1)
    throw new Error("Unsupported setup version. Expected version 1.");
  return {
    mode: value.mode,
    parameters: parametersFor(value.mode, value.parameters ?? {}),
  };
}

function setup() {
  return { version: 1, mode, parameters: { ...parameters } };
}

function updatePresetBadge() {
  const isDefault = Object.keys(DEFAULTS[mode]).every(
    (key) => parameters[key] === DEFAULTS[mode][key],
  );
  $("preset-badge").textContent = isDefault ? "SUCCESS PRESET" : "CUSTOM SETUP";
  $("preset-badge").classList.toggle("custom", !isDefault);
}

function makeControls() {
  $("parameter-groups").replaceChildren();
  PARAM_GROUPS.forEach((group, index) => {
    const details = document.createElement("details");
    details.className = "parameter-group";
    details.open = index === 0;
    const summary = document.createElement("summary");
    summary.textContent = group.title;
    details.append(summary);
    const fields = document.createElement("div");
    fields.className = "parameter-fields";
    for (const field of group.fields) {
      if (field.mode && field.mode !== mode) continue;
      const wrap = document.createElement("div");
      wrap.className = "parameter-field";
      const label =
        field.key === "height"
          ? mode === "ramp"
            ? "Ramp height"
            : "Target jump height"
          : field.label;
      wrap.innerHTML = `<div class="field-topline"><label for="range-${field.key}">${label}</label><div class="field-value"><input id="number-${field.key}" type="number" aria-label="${label} in ${field.unit}" min="${field.min}" max="${field.max}" step="${field.step}"/><span>${field.unit}</span></div></div><input id="range-${field.key}" type="range" min="${field.min}" max="${field.max}" step="${field.step}"/><div class="range-bounds" aria-hidden="true"><span>${field.min} ${field.unit}</span><span>${field.max} ${field.unit}</span></div>`;
      const range = wrap.querySelector('[type="range"]'),
        number = wrap.querySelector('[type="number"]');
      range.value = number.value = parameters[field.key];
      range.addEventListener("input", () => {
        number.value = range.value;
      });
      range.addEventListener("change", () =>
        changeParameter(field.key, Number(range.value)),
      );
      const commitNumber = () => {
        if (number.value === "" || !number.checkValidity()) return;
        range.value = number.value;
        const value = Number(number.value);
        if (parameters[field.key] !== value) changeParameter(field.key, value);
      };
      number.addEventListener("input", commitNumber);
      number.addEventListener("change", () => {
        if (!number.checkValidity() || number.value === "") {
          number.reportValidity();
          number.value = parameters[field.key];
          return;
        }
        commitNumber();
      });
      fields.append(wrap);
    }
    details.append(fields);
    $("parameter-groups").append(details);
  });
  $("landing-assist").checked = parameters.landingAssist;
  $("attitude-assist").checked = parameters.attitudeAssist;
  updatePresetBadge();
}

function changeParameter(key, value) {
  parameters = parametersFor(mode, { ...parameters, [key]: value });
  resetSimulation();
  updatePresetBadge();
}

function resetSimulation() {
  playing = false;
  accumulator = 0;
  if (simulation) simulation.reset(mode, parameters);
  view?.setMode(mode, parameters);
  view?.reset();
  $("outcome").classList.add("hidden");
  $("export-csv").disabled = true;
  updateRunButton();
  if (simulation) updateTelemetry(simulation.snapshot());
}

function switchMode(next, nextParameters = null) {
  mode = next;
  parameters = nextParameters ?? parametersFor(mode);
  for (const tab of document.querySelectorAll(".scene-tab")) {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  $("scene-label").textContent =
    mode === "ramp" ? "OVERHUNG RAMP" : "FIVE-VEHICLE KICKFLIP";
  $("reference-link").href = SOURCES[mode];
  $("scene-description").textContent =
    mode === "ramp"
      ? "Climb the overhang. Right the car in flight. Settle onto the runway."
      : "Launch from flat ground. Roll over the lineup. Land beyond it.";
  makeControls();
  resetSimulation();
}

function updateRunButton() {
  const terminal =
    simulation && ["complete", "crashed"].includes(simulation.phase);
  $("run-icon").textContent = playing ? "Ⅱ" : "▶";
  $("run-label").textContent = playing
    ? "Pause"
    : terminal
      ? "Run again"
      : simulation?.phase === "ready"
        ? "Run demo"
        : "Resume";
}

function toggleRun() {
  if (!simulation) return;
  if (["complete", "crashed"].includes(simulation.phase)) resetSimulation();
  if (simulation.phase === "ready") simulation.start();
  playing = !playing;
  accumulator = 0;
  updateRunButton();
}

function updateTelemetry(s) {
  $("phase-label").textContent = phaseNames[s.phase].toUpperCase();
  $("stage-text").textContent = playing
    ? phaseNames[s.phase]
    : s.phase === "ready"
      ? "Ready when you are"
      : `${phaseNames[s.phase]}${simulation.running ? " · paused" : ""}`;
  $("altitude").textContent = s.altitude.toFixed(1);
  $("vertical-speed").textContent =
    (s.velocity.y > 0.05 ? "+" : "") + s.velocity.y.toFixed(1);
  $("thrust").textContent = (s.thrustLevel * parameters.thrust).toFixed(1);
  $("load").textContent = s.metrics.peakLoadG.toFixed(2);
  $("fuel-label").textContent =
    `Thrust budget: ${Math.round(s.gasRemaining * 100)}%`;
  $("altitude-meter").style.width =
    `${Math.min(100, (s.altitude / 30) * 100)}%`;
  $("thrust-meter").style.width = `${s.thrustLevel * 100}%`;
  $("clock").textContent = `${s.time.toFixed(2).padStart(5, "0")} s`;
  const duration =
    simulation.approachDuration +
    simulation.rampDuration +
    parameters.flightTime +
    2;
  $("progress-fill").style.width =
    `${s.phase === "complete" ? 100 : Math.min(99, (s.time / duration) * 100)}%`;
  if (["complete", "crashed"].includes(s.phase)) {
    const success = s.phase === "complete";
    $("outcome").classList.toggle("failed", !success);
    $("outcome").classList.remove("hidden");
    $("outcome-icon").textContent = success ? "✓" : "!";
    $("outcome-title").textContent = success
      ? "Wheels down. Mission complete."
      : "This setup didn’t make it.";
    $("outcome-detail").textContent = success
      ? `${s.metrics.touchdownSpeed.toFixed(2)} m/s touchdown · ${s.metrics.peakLoadG.toFixed(2)}× weight peak wheel support`
      : s.reason;
    $("export-csv").disabled = false;
  }
}

function saveFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function frame(now) {
  const dt = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  if (playing) {
    accumulator += dt * Number($("playback-speed").value);
    const steps = Math.min(48, Math.floor(accumulator / STEP));
    if (steps > 0) {
      simulation.step(steps);
      accumulator -= steps * STEP;
      if (!simulation.running) {
        playing = false;
        accumulator = 0;
        updateRunButton();
      }
    }
  }
  const snapshot = simulation.snapshot();
  view.render(snapshot, dt);
  updateTelemetry(snapshot);
  requestAnimationFrame(frame);
}

async function boot() {
  if (location.hash.startsWith("#setup=")) {
    try {
      const initial = readSetup(
        JSON.parse(decodeURIComponent(location.hash.slice(7))),
      );
      mode = initial.mode;
      parameters = initial.parameters;
    } catch (error) {
      notify(`Setup link could not be loaded: ${error.message}`, true);
    }
  }
  await initializePhysics();
  simulation = new FlightSimulation(mode, parameters);
  view = new SceneView($("viewport"));
  switchMode(mode, parameters);
  $("loading").classList.add("hidden");
  $("run").disabled = false;
  $("run").addEventListener("click", toggleRun);
  $("restart").addEventListener("click", resetSimulation);
  $("restore-defaults").addEventListener("click", () => {
    switchMode(mode);
    notify("Successful preset restored.");
  });
  document
    .querySelectorAll(".scene-tab")
    .forEach((tab) =>
      tab.addEventListener("click", () => switchMode(tab.dataset.mode)),
    );
  document.querySelectorAll(".camera-button").forEach((button) =>
    button.addEventListener("click", () => {
      view.setCamera(button.dataset.camera);
      document.querySelectorAll(".camera-button").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
    }),
  );
  $("landing-assist").addEventListener("change", (event) =>
    changeParameter("landingAssist", event.target.checked),
  );
  $("attitude-assist").addEventListener("change", (event) =>
    changeParameter("attitudeAssist", event.target.checked),
  );
  $("export-csv").addEventListener("click", () => {
    const keys = Object.keys(simulation.trace[0]);
    const rows = [
      keys.join(","),
      ...simulation.trace.map((row) =>
        keys
          .map((key) =>
            typeof row[key] === "number" ? row[key].toFixed(6) : row[key],
          )
          .join(","),
      ),
    ];
    saveFile(
      `roadster-${mode}-telemetry.csv`,
      rows.join("\n") + "\n",
      "text/csv;charset=utf-8",
    );
  });
  $("save-setup").addEventListener("click", () =>
    saveFile(
      `roadster-${mode}-setup.json`,
      JSON.stringify(setup(), null, 2) + "\n",
      "application/json",
    ),
  );
  $("load-setup").addEventListener("click", () => $("setup-file").click());
  $("setup-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 100_000)
        throw new Error("Setup files must be smaller than 100 kB.");
      const loaded = readSetup(JSON.parse(await file.text()));
      switchMode(loaded.mode, loaded.parameters);
      notify("Setup loaded. Ready to fly.");
    } catch (error) {
      notify(`Setup could not be loaded: ${error.message}`, true);
    }
    event.target.value = "";
  });
  $("share").addEventListener("click", async () => {
    const url = new URL(location.href);
    url.hash = "setup=" + encodeURIComponent(JSON.stringify(setup()));
    try {
      await navigator.clipboard.writeText(url.href);
      notify("Setup link copied.");
    } catch (error) {
      notify(
        `Clipboard unavailable: ${error.message}. Use Save JSON to share this setup.`,
        true,
      );
    }
  });
  $("about").addEventListener("click", () => $("model-dialog").showModal());
  $("close-dialog").addEventListener("click", () => $("model-dialog").close());
  $("model-dialog").addEventListener("click", (event) => {
    if (event.target === $("model-dialog")) $("model-dialog").close();
  });
  window.addEventListener("keydown", (event) => {
    if (
      ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "SUMMARY"].includes(
        document.activeElement?.tagName,
      ) ||
      $("model-dialog").open
    )
      return;
    if (event.code === "Space") {
      event.preventDefault();
      toggleRun();
    }
    if (event.code === "KeyR") resetSimulation();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      playing = false;
      accumulator = 0;
      updateRunButton();
    }
  });
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      simulation.dispose();
      view.dispose();
    }
  });
  // A small read-only diagnostics interface for browser acceptance and reproducibility.
  window.roadsterLab = Object.freeze({
    snapshot: () => simulation.snapshot(),
    setup: () => setup(),
  });
  requestAnimationFrame(frame);
}

boot().catch((error) => {
  console.error("Flight lab failed to initialize:", error);
  $("loading").replaceChildren();
  const title = document.createElement("strong"),
    detail = document.createElement("p");
  title.textContent = "The flight lab could not start.";
  detail.textContent = `${error.message}. A WebGL 2-capable browser is required.`;
  $("loading").append(title, detail);
});
