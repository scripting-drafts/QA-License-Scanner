"use strict";

const { isHttpsUrl, readJson } = require("./util");

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const LICENSE_RE = /^[A-Za-z0-9.+-]+(?: (?:AND|OR|WITH) [A-Za-z0-9.+-]+)*$/;
const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const SCOPES = new Set([
  "project", "shipped", "dependency", "build", "runtime", "asset", "system",
  "companion",
]);
const KINDS = new Set(["text", "html", "external"]);
const CATEGORIES = new Set([
  "licensing", "distribution", "privacy", "export", "trademark",
  "contributions", "accessibility",
]);
const STATUSES = new Set(["reviewed", "pending", "not-applicable"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isString(value, max = 500) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function validDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function validRelativePath(value) {
  if (!isString(value, 300)) return false;
  if (value.includes("\0") || value.startsWith("/")) return false;
  if (!/^[A-Za-z0-9._@+/-]+$/.test(value)) return false;
  return !value.split("/").includes("..");
}

function push(errors, where, message) {
  errors.push(`${where}: ${message}`);
}

function validateManifest(manifest) {
  const errors = [];
  if (!isObject(manifest)) {
    return ["manifest: must be a JSON object"];
  }
  if (manifest.schemaVersion !== 1) {
    push(errors, "schemaVersion", "must be 1");
  }
  if (!isString(manifest.product, 80)) {
    push(errors, "product", "must be a non-empty string (max 80)");
  }
  if (!isString(manifest.spdx, 240) || !LICENSE_RE.test(manifest.spdx)) {
    push(errors, "spdx", "must be a valid SPDX-style license expression");
  }
  if (!isString(manifest.copyright, 240)) {
    push(errors, "copyright", "must be a non-empty string (max 240)");
  }
  if (!isHttpsUrl(manifest.source)) {
    push(errors, "source", "must be an https URL");
  }
  if (manifest.homepage != null && !isHttpsUrl(manifest.homepage)) {
    push(errors, "homepage", "must be an https URL");
  }
  if (!validDate(manifest.lastReviewed)) {
    push(errors, "lastReviewed", "must be a valid YYYY-MM-DD date");
  }
  if (!isString(manifest.reviewedVersion, 80)) {
    push(errors, "reviewedVersion", "must be a non-empty string (max 80)");
  }
  if (manifest.reviewedComponents != null) {
    if (!isObject(manifest.reviewedComponents)) {
      push(errors, "reviewedComponents", "must be an object of component versions");
    } else {
      for (const [key, value] of Object.entries(manifest.reviewedComponents)) {
        if (!isString(value, 80)) {
          push(errors, `reviewedComponents.${key}`, "must be a non-empty string");
        }
      }
    }
  }

  if (!Array.isArray(manifest.components) || manifest.components.length === 0) {
    push(errors, "components", "must be a non-empty array");
  } else {
    const seen = new Set();
    manifest.components.forEach((component, index) => {
      const where = `components[${index}]`;
      if (!isObject(component)) {
        push(errors, where, "must be an object");
        return;
      }
      if (!isString(component.id, 64) || !ID_RE.test(component.id)) {
        push(errors, `${where}.id`, "must match ^[a-z0-9][a-z0-9._-]*$");
      } else if (seen.has(component.id)) {
        push(errors, `${where}.id`, "must be unique");
      } else {
        seen.add(component.id);
      }
      if (!isString(component.name, 120)) {
        push(errors, `${where}.name`, "must be a non-empty string (max 120)");
      }
      if (!isString(component.license, 240) ||
          !LICENSE_RE.test(component.license)) {
        push(errors, `${where}.license`, "must be a valid SPDX-style license expression");
      }
      if (!SCOPES.has(component.scope)) {
        push(errors, `${where}.scope`, `must be one of ${[...SCOPES].join(", ")}`);
      }
      if (component.version != null && !isString(component.version, 80)) {
        push(errors, `${where}.version`, "must be a non-empty string (max 80)");
      }
      if (component.versionFrom != null && !isString(component.versionFrom, 80)) {
        push(errors, `${where}.versionFrom`, "must be a non-empty string (max 80)");
      }
      if (component.notice != null && !validRelativePath(component.notice)) {
        push(errors, `${where}.notice`, "must be a relative repo path without '..'");
      }
      if (component.url != null && !isHttpsUrl(component.url)) {
        push(errors, `${where}.url`, "must be an https URL");
      }
    });
  }

  if (!Array.isArray(manifest.documents) || manifest.documents.length === 0) {
    push(errors, "documents", "must be a non-empty array");
  } else {
    const seen = new Set();
    manifest.documents.forEach((document, index) => {
      const where = `documents[${index}]`;
      if (!isObject(document)) {
        push(errors, where, "must be an object");
        return;
      }
      if (!isString(document.id, 64) || !ID_RE.test(document.id)) {
        push(errors, `${where}.id`, "must match ^[a-z0-9][a-z0-9._-]*$");
      } else if (seen.has(document.id)) {
        push(errors, `${where}.id`, "must be unique");
      } else {
        seen.add(document.id);
      }
      if (!isString(document.label, 120)) {
        push(errors, `${where}.label`, "must be a non-empty string (max 120)");
      }
      if (!validRelativePath(document.path)) {
        push(errors, `${where}.path`, "must be a relative repo path without '..'");
      }
      if (!KINDS.has(document.kind)) {
        push(errors, `${where}.kind`, `must be one of ${[...KINDS].join(", ")}`);
      }
      if (document.maxBytes != null) {
        if (!Number.isInteger(document.maxBytes) ||
            document.maxBytes < 1 || document.maxBytes > 10485760) {
          push(errors, `${where}.maxBytes`, "must be an integer from 1 to 10485760");
        }
      }
    });
  }

  if (!Array.isArray(manifest.reviews)) {
    push(errors, "reviews", "must be an array");
  } else {
    const seen = new Set();
    manifest.reviews.forEach((review, index) => {
      const where = `reviews[${index}]`;
      if (!isObject(review)) {
        push(errors, where, "must be an object");
        return;
      }
      if (!isString(review.id, 64) || !ID_RE.test(review.id)) {
        push(errors, `${where}.id`, "must match ^[a-z0-9][a-z0-9._-]*$");
      } else if (seen.has(review.id)) {
        push(errors, `${where}.id`, "must be unique");
      } else {
        seen.add(review.id);
      }
      if (!CATEGORIES.has(review.category)) {
        push(errors, `${where}.category`, `must be one of ${[...CATEGORIES].join(", ")}`);
      }
      if (!STATUSES.has(review.status)) {
        push(errors, `${where}.status`, `must be one of ${[...STATUSES].join(", ")}`);
      }
      if (!validDate(review.date)) {
        push(errors, `${where}.date`, "must be a valid YYYY-MM-DD date");
      }
      if (typeof review.note !== "string" || review.note.length > 500) {
        push(errors, `${where}.note`, "must be a string (max 500)");
      }
    });
  }

  return errors;
}

function validateFile(file) {
  const manifest = readJson(file);
  return { manifest, errors: validateManifest(manifest) };
}

function assertValidManifest(manifest) {
  const errors = validateManifest(manifest);
  if (errors.length) {
    const error = new Error(`invalid legal manifest:\n${errors.join("\n")}`);
    error.errors = errors;
    throw error;
  }
  return manifest;
}

module.exports = {
  assertValidManifest,
  validateFile,
  validateManifest,
  validDate,
  validRelativePath,
};
