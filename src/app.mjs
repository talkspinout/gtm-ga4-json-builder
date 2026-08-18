import { buildFromJson } from "./builder.mjs";

const form = document.querySelector("#builder-form");
const input = document.querySelector("#spec-input");
const errors = document.querySelector("#errors");
const preview = document.querySelector("#preview");
const download = document.querySelector("#download");
let downloadUrl = null;

function clearDownload() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  download.hidden = true;
  download.removeAttribute("href");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearDownload();
  const result = buildFromJson(input.value);
  errors.replaceChildren();

  if (result.errors.length) {
    const list = document.createElement("ul");
    for (const message of result.errors) {
      const item = document.createElement("li");
      item.textContent = message;
      list.append(item);
    }
    errors.append(list);
    preview.textContent = "Validation errors must be fixed before a container can be generated.";
    return;
  }

  const json = JSON.stringify(result.output, null, 2);
  preview.textContent = json;
  downloadUrl = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  download.href = downloadUrl;
  download.download = "gtm-ga4-container.json";
  download.hidden = false;
});

window.addEventListener("pagehide", clearDownload);
