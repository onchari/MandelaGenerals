import { firebaseEnvironment } from "./config/firebase";
import "./environment-indicator.css";

const indicator = document.createElement("aside");
indicator.id = "environment-indicator";
indicator.className = `environment-indicator environment-indicator-${firebaseEnvironment}`;
indicator.textContent = `Using ${firebaseEnvironment}`;
indicator.setAttribute("aria-label", `Connected to the ${firebaseEnvironment} environment`);
document.body.append(indicator);
