import {
  canSwitchFirebaseEnvironment,
  firebaseEnvironment,
  switchFirebaseEnvironment,
} from "./config/firebase";
import "./environment-switcher.css";

export function mountEnvironmentSwitcher(): void {
  if (!canSwitchFirebaseEnvironment || document.querySelector("#environment-switcher")) {
    return;
  }

  const container = document.createElement("aside");
  container.id = "environment-switcher";
  container.className = `environment-switcher environment-switcher-${firebaseEnvironment}`;

  const label = document.createElement("span");
  label.textContent = `Using ${firebaseEnvironment}`;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `Switch to ${firebaseEnvironment === "production" ? "development" : "production"}`;
  button.addEventListener("click", async () => {
    const nextEnvironment = firebaseEnvironment === "production" ? "development" : "production";
    if (!window.confirm(
      `Switch to ${nextEnvironment}? You will be signed out of ${firebaseEnvironment}. The two environments have separate accounts and data.`,
    )) {
      return;
    }

    button.disabled = true;
    try {
      await switchFirebaseEnvironment();
    } catch (error) {
      button.disabled = false;
      const message = error instanceof Error ? error.message : "Could not switch Firebase environments.";
      window.alert(message);
    }
  });

  container.append(label, button);
  document.body.append(container);
}

mountEnvironmentSwitcher();
