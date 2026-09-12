// Krea — image generation and image-to-image, wired to the open document.
//
// Krea's API is asynchronous: a POST starts a job and returns an id, then you
// ask for that job until it hands back URLs.
//
//   POST /generate/image/{provider}/{model}[/{size}]   → { job_id, status }
//   GET  /jobs/{id}                                    → { status, result: { urls } }
//
// Models do not share a schema, which is the part worth knowing. Krea's own
// models live at a path with a size on the end and take a single `image_url`;
// the third-party ones sit at a plain path and take an `image_urls` array. Krea
// 2 also insists on an aspect ratio and only accepts 1K. Get any of that wrong
// and the answer is a bare 404 or 422, so the table below carries each model's
// shape and the request is built from it.
//
// Checked against krea.ai/docs in September 2026.

const BASE = "https://api.krea.ai";

const MODELS = [
  {
    value: "krea/krea-2/large",
    label: "Krea 2 Large",
    group: "Krea",
    imageField: "image_url",
    resolutions: ["1K"],
    aspects: ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"],
    needsAspect: true,
    supportsStrength: true,
  },
  {
    value: "krea/krea-2/medium",
    label: "Krea 2 Medium",
    group: "Krea",
    imageField: "image_url",
    resolutions: ["1K"],
    aspects: ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"],
    needsAspect: true,
    supportsStrength: true,
  },
  {
    value: "krea/krea-2/medium-turbo",
    label: "Krea 2 Medium Turbo",
    group: "Krea",
    imageField: "image_url",
    resolutions: ["1K"],
    aspects: ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"],
    needsAspect: true,
    supportsStrength: true,
  },
  {
    value: "google/nano-banana-pro",
    label: "Nano Banana Pro",
    group: "Google",
    imageField: "image_urls",
    resolutions: ["1K", "2K", "4K"],
    aspects: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
  },
  {
    value: "google/nano-banana",
    label: "Nano Banana",
    group: "Google",
    imageField: "image_urls",
    resolutions: [],
    aspects: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
    needsAspect: true,
  },
  {
    value: "google/nano-banana-2",
    label: "Nano Banana 2",
    group: "Google",
    imageField: "image_urls",
    resolutions: ["1K", "2K", "4K"],
    aspects: ["4:1", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16", "1:4", "1:8"],
    needsAspect: true,
  },
  {
    value: "z-image/z-image",
    label: "Z Image",
    group: "Z Image",
    imageField: "image_url",
    resolutions: ["1K"],
    aspects: ["1:1", "4:3", "2:3", "16:9", "9:16"],
    needsAspect: true,
  },
  {
    value: "bytedance/seedream-5-pro",
    label: "Seedream 5 Pro",
    group: "ByteDance",
    imageField: "style_images",
    dimensions: true,
  },
  {
    value: "bytedance/seedream-5-lite",
    label: "Seedream 5 Lite",
    group: "ByteDance",
    imageField: "style_images",
    dimensions: true,
  },
  {
    value: "openai/gpt-image-2.5-flare",
    label: "GPT Image 2.5 Flare",
    group: "OpenAI",
    imageField: "image_urls",
    resolutions: ["1K", "2K", "4K"],
    aspects: ["16:9", "2:1", "3:2", "4:3", "1:1", "3:4", "2:3", "1:2", "9:16"],
    needsAspect: true,
  },
  {
    value: "openai/gpt-image-2.5-sunburst",
    label: "GPT Image 2.5 Sunburst",
    group: "OpenAI",
    imageField: "image_urls",
    resolutions: ["1K", "2K", "4K"],
    aspects: ["16:9", "2:1", "3:2", "4:3", "1:1", "3:4", "2:3", "1:2", "9:16"],
    needsAspect: true,
  },
  {
    value: "bfl/flux-1-kontext-dev",
    label: "FLUX Kontext",
    group: "Black Forest Labs",
    imageField: "image_url",
    dimensions: true,
  },
  {
    value: "bfl/flux-1.1-pro",
    label: "FLUX 1.1 Pro",
    group: "Black Forest Labs",
    imageField: "none",
    dimensions: true,
  },
  {
    value: "openai/gpt-image",
    label: "ChatGPT Image",
    group: "OpenAI",
    imageField: "image_urls",
    dimensions: true,
  },
];

// Stored preferences may contain an endpoint name from a version published
// before Krea's current OpenAPI. Keep those choices useful rather than turning
// them into a surprising 404 after an update.
const MODEL_ALIASES = {
  "krea/krea-2/turbo": "krea/krea-2/medium-turbo",
  "black-forest-labs/flux-kontext": "bfl/flux-1-kontext-dev",
  "black-forest-labs/flux-1.1-pro": "bfl/flux-1.1-pro",
  "openai/chatgpt-image": "openai/gpt-image",
  "openai/gpt-image-2.5/flare": "openai/gpt-image-2.5-flare",
  "openai/gpt-image-2.5/sunburst": "openai/gpt-image-2.5-sunburst",
};

const DEFAULT_ASPECTS = ["1:1", "4:3", "3:2", "16:9", "4:5", "2:3", "9:16"];
const RESOLUTION_PIXELS = { "1K": 1024, "2K": 2048, "4K": 4096 };

function canonicalModel(id) {
  return MODEL_ALIASES[id] || id;
}

function specFor(id) {
  return (
    MODELS.find((m) => m.value === canonicalModel(id)) || {
      value: id,
      label: id,
      imageField: "image_urls",
    }
  );
}

function dimensionsFor(aspect, resolution) {
  const [wide, tall] = String(aspect || "1:1").split(":").map(Number);
  const ratio = wide > 0 && tall > 0 ? wide / tall : 1;
  const longSide = RESOLUTION_PIXELS[resolution] || RESOLUTION_PIXELS["1K"];
  if (ratio >= 1) return { width: longSide, height: Math.max(1, Math.round(longSide / ratio)) };
  return { width: Math.max(1, Math.round(longSide * ratio)), height: longSide };
}

// Krea has used both REST job replies and the newer SDK-style result envelope.
// Accept the useful parts from either shape so a completed image is not lost
// merely because it did not arrive through the old `{ job_id }` response.
function jobIdFrom(data) {
  const candidates = [
    data,
    data && data.job,
    data && data.data,
    data && data.result,
    data && data.output,
  ];
  for (const value of candidates) {
    if (!value || typeof value !== "object") continue;
    for (const key of ["job_id", "jobId", "id"]) {
      if (typeof value[key] === "string" || typeof value[key] === "number") return String(value[key]);
    }
  }
  return "";
}

function urlsFrom(data) {
  const candidates = [
    data,
    data && data.result,
    data && data.data,
    data && data.data && data.data.result,
    data && data.output,
    data && data.output && data.output.result,
  ];
  for (const value of candidates) {
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value.urls) && value.urls.length) return value.urls.map(String);
    if (typeof value.url === "string" && value.url) return [value.url];
  }
  return [];
}

function responseFields(data) {
  return data && typeof data === "object" ? Object.keys(data).slice(0, 12).join(", ") || "no fields" : typeof data;
}

// Some Krea edge nodes answer JSON with a non-JSON content type. The worker
// correctly keeps the raw text in that case; recover it here before deciding a
// successful request contains no job.
function responseData(reply) {
  if (reply && reply.data !== undefined) return reply.data;
  const text = String((reply && reply.text) || "").trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function responseDescription(reply, data) {
  const contentType = (reply && reply.contentType) || "no content type";
  const text = String((reply && reply.text) || "").trim();
  if (!text || data !== text) return `content type: ${contentType}`;
  return `content type: ${contentType}; body: ${text.slice(0, 300)}`;
}

async function authHeaders(ctx) {
  const key = await ctx.secrets.get("KREA_API_KEY");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

// Artwork can travel two ways: inline as a data URI, or uploaded first and
// referenced by the URL that comes back. Anything of real size goes the second
// way — a full page export is megabytes, and megabytes of base64 inside a JSON
// body is slow at best and refused at worst.
const INLINE_LIMIT_BYTES = 512 * 1024;

async function artworkUrl(ctx, source, headers) {
  // The Affinity helper cannot know the exported file's size at the moment it
  // returns its path, so `source.bytes` is deliberately 0 there. Measure the
  // real file here before choosing between a compact data URI and an upload.
  const bytes = await ctx.files.read(source.path);
  const actualBytes = bytes.byteLength;
  if (!actualBytes) {
    throw new Error("Affinity exported an empty image. Select visible artwork and try again.");
  }

  if (actualBytes <= INLINE_LIMIT_BYTES) {
    ctx.progress("Reading the artwork");
    return { url: await ctx.files.toDataUri(source.path), bytes: actualBytes };
  }

  ctx.progress("Uploading the artwork");
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), source.filename || "artwork.png");
  form.append("description", "From Affinity, via Connector for Affinity");

  // FormData sets its own content type with the boundary, so the JSON one must
  // not be forced on it here.
  const upload = await ctx.http.post(`${BASE}/assets`, {
    headers: { Authorization: headers.Authorization },
    body: form,
  });

  if (upload.ok && upload.data && (upload.data.image_url || upload.data.url)) {
    const url = upload.data.image_url || upload.data.url;
    ctx.log(`Uploaded ${Math.round(actualBytes / 1024)} KB as an asset`);
    return { url, bytes: actualBytes };
  }

  ctx.log.warn(
    `Uploading the asset did not work (HTTP ${upload.status}), sending it inline instead`,
  );
  return { url: await ctx.files.toDataUri(source.path), bytes: actualBytes };
}

module.exports = {
  options: {
    // What this model actually accepts. Krea 2 only does 1K, and asking for
    // more is a 422 rather than a quiet step down — so the form should not
    // offer it in the first place.
    async resolutions(ctx) {
      const spec = specFor(String(ctx.input.model || "krea/krea-2/large"));
      return (spec.resolutions || ["1K", "2K", "4K"]).map((r) => ({ value: r, label: r }));
    },

    // Likewise the aspect ratios: the lists differ between Krea's own models
    // and the ones it hosts.
    async aspects(ctx) {
      const spec = specFor(String(ctx.input.model || "krea/krea-2/large"));
      const list = spec.aspects || ["1:1", "4:3", "3:2", "16:9", "4:5", "2:3", "9:16"];
      return list.map((a) => ({ value: a, label: a }));
    },

    // Krea's own list, when the account can see one. The table above is the
    // fallback, and the only source that also knows each model's shape.
    async models(ctx) {
      try {
        const headers = await authHeaders(ctx);
        const reply = await ctx.http.get(`${BASE}/models`, { headers });
        const found = reply.data && (reply.data.models || reply.data.data || reply.data);
        const items = Array.isArray(found) ? found : [];
        const mapped = items
          .map((m) => {
            const id = m.id || m.name || m.model;
            return id ? { value: String(id), label: String(m.label || m.title || id) } : null;
          })
          .filter(Boolean);
        if (mapped.length) return mapped;
      } catch (err) {
        ctx.log.warn("Krea did not return a model list, offering the documented ones instead");
      }
      return MODELS.map(({ value, label, group }) => ({ value, label, group }));
    },
  },

  async run(ctx) {
    const prompt = String(ctx.input.prompt || "").trim();
    if (prompt.length < 3) throw new Error("Write a prompt of at least three characters.");

    const selectedModel = String(ctx.input.model || "krea/krea-2/large");
    const model = canonicalModel(selectedModel);
    const spec = specFor(model);
    const headers = await authHeaders(ctx);
    const body = { prompt };

    // The form always offers the same three familiar output sizes. Some models
    // (notably Krea 2) only accept 1K, so ignore an unavailable higher choice
    // rather than making Affinity's fixed dialog lie about what it can show.
    const wanted = ctx.input.resolution || "1K";
    if (Array.isArray(spec.resolutions) && spec.resolutions.length) {
      const resolution = spec.resolutions.includes(wanted) ? wanted : spec.resolutions[0];
      if (resolution !== wanted) {
        ctx.log.warn(`${spec.label} only offers ${spec.resolutions.join(", ")} — ignoring ${wanted}`);
      }
      body.resolution = resolution;
    } else if (!Array.isArray(spec.resolutions) && !spec.dimensions && wanted) {
      body.resolution = wanted;
    } else if (Array.isArray(spec.resolutions) && !spec.resolutions.length && wanted !== "1K") {
      ctx.log.warn(`${spec.label} does not accept a resolution setting — ignoring ${wanted}`);
    }

    const source = ctx.input.image;
    if (source && source.path) {
      const artwork = await artworkUrl(ctx, source, headers);
      const reference = artwork.url;
      if (spec.imageField === "none") {
        ctx.log.warn(`${spec.label} does not accept a reference image — generating from the prompt only`);
      } else if (spec.imageField === "style_images") {
        body.style_images = [{ url: reference, strength: 1 }];
      } else {
        // Singular string for Krea and Z Image, an array for the other APIs.
        body[spec.imageField] = spec.imageField === "image_url" ? reference : [reference];
      }
      if (spec.supportsStrength && ctx.input.strength !== undefined && ctx.input.strength !== "") {
        body.strength = Number(ctx.input.strength);
      }
      ctx.log(`Sending ${Math.round(artwork.bytes / 1024)} KB of artwork from the ${source.source}`);
    }

    const chosenAspect = ctx.input.aspect || "1:1";
    const aspects = spec.aspects || DEFAULT_ASPECTS;
    const aspect = aspects.includes(chosenAspect) ? chosenAspect : aspects[0];
    if (chosenAspect !== aspect) ctx.log.warn(`${spec.label} does not support ${chosenAspect} — using ${aspect}`);
    if (spec.dimensions) Object.assign(body, dimensionsFor(aspect, wanted));
    else if (spec.needsAspect || !source || !source.path) body.aspect_ratio = aspect;

    ctx.progress("Submitting the job");
    const url = `${BASE}/generate/image/${model}`;
    const submit = await ctx.http.postJson(url, body, { headers });
    if (!submit.ok) {
      if (submit.status === 404) {
        throw new Error(
          `Krea has no endpoint at ${url}. Krea's own models need a size on the end, such as krea/krea-2/large.`,
        );
      }
      throw new Error(krea(submit, "Krea refused the job"));
    }

    const submitData = responseData(submit);
    const completed = urlsFrom(submitData);
    const jobId = jobIdFrom(submitData);
    let urls = completed;

    if (urls.length) {
      ctx.log(`Krea returned ${urls.length} completed image${urls.length === 1 ? "" : "s"}`);
    } else {
      if (!jobId) {
        throw new Error(
          `Krea accepted the request but returned neither a job id nor image URLs (fields: ${responseFields(submitData)}; ${responseDescription(submit, submitData)}).`,
        );
      }
      ctx.log("Job", jobId, "accepted");

      urls = await ctx.until(
        async (attempt) => {
          const poll = await ctx.http.get(`${BASE}/jobs/${jobId}`, { headers });
          const response = responseData(poll) || {};
          const job = response.job || response.data || response;
          const status = String(job.status || response.status || "unknown");
          ctx.progress(`${status} (checked ${attempt}×)`);

          if (status === "completed") {
            const found = urlsFrom(response);
            if (!found.length) throw new Error("Krea finished the job but returned no images");
            return found;
          }
          if (status === "failed" || status === "cancelled") {
            throw new Error(
              `Krea reported the job as ${status}: ${job.error || response.error || "no reason given"}`,
            );
          }
          return undefined; // keep waiting
        },
        { everyMs: 2500, message: "Krea did not finish in time. The job may still complete on their side." },
      );
    }

    ctx.progress("Downloading");
    const images = [];
    for (const url of urls) {
      const file = await ctx.http.download(String(url));
      images.push({ path: file.path, caption: spec.label });
      ctx.log("Got", file.filename, `(${Math.round(file.bytes / 1024)} KB)`);
    }

    if (ctx.input.place !== false) {
      const direct = ctx.input.__bridgeDirect === true;
      if (direct && images.length === 1) {
        // Placement is deferred until the helper's synchronous HTTP call has
        // returned to Affinity.
        await (source
          ? ctx.affinity.putBack(images[0].path, source)
          : ctx.affinity.placeImage(images[0].path, {}));
        ctx.progress("Placed in the document");
      } else if (direct && images.length > 1) {
        return {
          message: `${images.length} results ready to choose from`,
          __bridgeChoice: {
            question: "Which Krea result?",
            paths: images.map((image) => image.path),
            options: images.map((_, i) => `Version ${i + 1}`),
            source,
          },
          images,
        };
      } else {
        const doc = await ctx.affinity.info();
        if (!doc.open) {
          ctx.log.warn("No document is open, so the images are waiting in the handover folder.");
        } else if (images.length === 1) {
          // One picture is not a decision, so it goes home without being asked.
          await (source
            ? ctx.affinity.putBack(images[0].path, source)
            : ctx.affinity.placeImage(images[0].path, {}));
          ctx.progress("Placed in the document");
        } else {
          // Several are. A picture on top of a picture on top of a picture is
          // not a choice, it is a mess, so they wait to be looked through.
          ctx.log.warn(
            `${images.length} came back, so none were placed. Look through them and place the one you want.`,
          );
        }
      }
    }

    return {
      message: `${images.length} image${images.length === 1 ? "" : "s"} from ${spec.label}`,
      images,
    };
  },
};

// Krea reports problems in a few different shapes; show whichever one arrived.
function krea(reply, fallback) {
  const data = reply.data || {};
  const detail = describeKreaError(
    data.error || data.message || data.detail || data.details || data.errors || (reply.text || "").slice(0, 500),
  );
  return `${fallback} (HTTP ${reply.status})${detail ? ": " + detail : ""}`;
}

function describeKreaError(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(describeKreaError).filter(Boolean).join("; ").slice(0, 500);
  if (typeof value === "object") {
    const path = value.path || value.field || value.location;
    const message = value.message || value.detail || value.error || value.reason;
    if (path && message) return `${path}: ${describeKreaError(message)}`;
    if (message) return describeKreaError(message);
    try {
      return JSON.stringify(value).slice(0, 500);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
