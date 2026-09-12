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
    value: "krea/krea-2/turbo",
    label: "Krea 2 Turbo",
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
    resolutions: ["1K", "2K"],
  },
  {
    value: "black-forest-labs/flux-kontext",
    label: "FLUX Kontext",
    group: "Black Forest Labs",
    imageField: "image_urls",
  },
  {
    value: "black-forest-labs/flux-1.1-pro",
    label: "FLUX 1.1 Pro",
    group: "Black Forest Labs",
    imageField: "image_urls",
  },
  {
    value: "openai/chatgpt-image",
    label: "ChatGPT Image",
    group: "OpenAI",
    imageField: "image_urls",
  },
];

function specFor(id) {
  return (
    MODELS.find((m) => m.value === id) || {
      value: id,
      label: id,
      imageField: "image_urls",
    }
  );
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
  if (source.bytes <= INLINE_LIMIT_BYTES) {
    ctx.progress("Reading the artwork");
    return ctx.files.toDataUri(source.path);
  }

  ctx.progress("Uploading the artwork");
  const bytes = await ctx.files.read(source.path);
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
    ctx.log(`Uploaded ${Math.round(source.bytes / 1024)} KB as an asset`);
    return url;
  }

  ctx.log.warn(
    `Uploading the asset did not work (HTTP ${upload.status}), sending it inline instead`,
  );
  return ctx.files.toDataUri(source.path);
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

    const model = String(ctx.input.model || "krea/krea-2/large");
    const spec = specFor(model);
    const headers = await authHeaders(ctx);
    const body = { prompt };

    // Only send a resolution the model actually accepts. Krea 2 rejects
    // anything above 1K rather than quietly stepping down.
    const wanted = ctx.input.resolution || "1K";
    if (spec.resolutions) {
      const resolution = spec.resolutions.includes(wanted) ? wanted : spec.resolutions[0];
      if (resolution !== wanted) {
        ctx.log.warn(`${spec.label} only offers ${spec.resolutions.join(", ")} — using ${resolution}`);
      }
      body.resolution = resolution;
    } else if (wanted) {
      body.resolution = wanted;
    }

    const source = ctx.input.image;
    if (source && source.path) {
      const reference = await artworkUrl(ctx, source, headers);
      // Singular string for Krea's own models, an array for everyone else.
      body[spec.imageField] = spec.imageField === "image_url" ? reference : [reference];
      if (spec.supportsStrength && ctx.input.strength !== undefined && ctx.input.strength !== "") {
        body.strength = Number(ctx.input.strength);
      }
      ctx.log(`Sending ${Math.round(source.bytes / 1024)} KB of artwork from the ${source.source}`);
    }

    // Krea 2 requires an aspect ratio even when working from an image.
    const aspect = ctx.input.aspect || "1:1";
    if (spec.needsAspect || !source || !source.path) {
      body.aspect_ratio = spec.aspects && !spec.aspects.includes(aspect) ? spec.aspects[0] : aspect;
    }

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

    const jobId = submit.data && (submit.data.job_id || submit.data.id);
    if (!jobId) throw new Error("Krea accepted the request but returned no job id");
    ctx.log("Job", jobId, "accepted");

    const urls = await ctx.until(
      async (attempt) => {
        const poll = await ctx.http.get(`${BASE}/jobs/${jobId}`, { headers });
        const job = poll.data || {};
        const status = String(job.status || "unknown");
        ctx.progress(`${status} (checked ${attempt}×)`);

        if (status === "completed") {
          const found = (job.result && job.result.urls) || [];
          if (!found.length) throw new Error("Krea finished the job but returned no images");
          return found;
        }
        if (status === "failed" || status === "cancelled") {
          throw new Error(`Krea reported the job as ${status}: ${job.error || "no reason given"}`);
        }
        return undefined; // keep waiting
      },
      { everyMs: 2500, message: "Krea did not finish in time. The job may still complete on their side." },
    );

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
  const detail = data.error || data.message || data.detail || (reply.text || "").slice(0, 300);
  return `${fallback} (HTTP ${reply.status})${detail ? ": " + detail : ""}`;
}
