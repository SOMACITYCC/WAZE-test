// Receives a completed "Where You Fit" assessment and records it in Planning Center.
// Steps: find or create the person -> find or create a card in the workflow -> add the results as a card note.
// Optionally emails the person a short summary via Resend.

const PCO = "https://api.planningcenteronline.com/people/v2";
const {
  PCO_APP_ID, PCO_SECRET,
  PCO_WORKFLOW_ID = "786981",
  PCO_PROMOTE = "false",           // "true" moves the card to the next workflow step after submission
  ALLOWED_ORIGIN,                  // e.g. https://assessment.somacity.cc (optional but recommended)
  RESEND_API_KEY, EMAIL_FROM,      // optional summary email
} = process.env;

const LINES = {
  Detailer: "Precise, dependable, grounded in the real work. You finish what you start and catch what others miss.",
  Developer: "Leads people up close. Runs teams, manages process, keeps things moving without losing the human side.",
  Builder: "Holds the whole picture. Equally comfortable with strategy and details, vision and execution.",
  Strategist: "Starts things. Sees opportunities, takes initiative, moves fast.",
  Visionary: "Thinks ahead. Sees what could exist before anyone else does.",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const clean = (v, max, keepNewlines = false) =>
  String(v ?? "")
    .replace(keepNewlines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);

async function pco(path, method = "GET", body) {
  const auth = "Basic " + Buffer.from(`${PCO_APP_ID}:${PCO_SECRET}`).toString("base64");
  const res = await fetch(PCO + path, {
    method,
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Planning Center ${method} ${path} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

async function findOrCreatePerson(name, email) {
  const q = await pco(`/people?where[search_name_or_email]=${encodeURIComponent(email)}&include=emails&per_page=25`);
  const matchIds = new Set(
    (q.included || [])
      .filter((i) => i.type === "Email" && String(i.attributes?.address || "").toLowerCase() === email)
      .map((i) => i.id)
  );
  const found = (q.data || []).find((p) => (p.relationships?.emails?.data || []).some((e) => matchIds.has(e.id)));
  if (found) return found.id;

  const [first, ...rest] = name.split(/\s+/);
  const created = await pco("/people", "POST", {
    data: { type: "Person", attributes: { first_name: first, last_name: rest.join(" ") } },
  });
  const id = created.data.id;
  await pco(`/people/${id}/emails`, "POST", {
    data: { type: "Email", attributes: { address: email, location: "Home", primary: true } },
  });
  return id;
}

async function findOrCreateCard(personId) {
  const cards = await pco(`/people/${personId}/workflow_cards?per_page=100`);
  const open = (cards.data || []).find(
    (c) => String(c.relationships?.workflow?.data?.id) === String(PCO_WORKFLOW_ID) && !c.attributes?.removed_at && !c.attributes?.completed_at
  );
  if (open) return open.id;
  const created = await pco(`/workflows/${PCO_WORKFLOW_ID}/cards`, "POST", {
    data: { type: "WorkflowCard", attributes: { person_id: Number(personId) } },
  });
  return created.data.id;
}

function buildNote(p) {
  const when = new Date(p.submittedAt || Date.now()).toISOString().slice(0, 10);
  const lines = [
    `WAZE results (${when})`,
    `Type: ${p.type}${p.tendency ? ` with strong ${p.tendency} tendencies` : ""}`,
    `Wavelength: ${p.wavelength} / 10`,
    `Ratings (risk, change, logic, variables, ambiguity, opportunity): ${p.answers.join(", ")}`,
    `Gut check: ${p.gutCheck}`,
    "",
    ...p.reflections.flatMap((r) => [r.question, r.answer || "(no answer)", ""]),
  ];
  return lines.join("\n").slice(0, 9000);
}

async function sendSummary(p) {
  if (!RESEND_API_KEY || !EMAIL_FROM) return;
  const text =
    `Hey ${p.name.split(/\s+/)[0]},\n\nThanks for taking the WAZE assessment at ${p.church}.\n\n` +
    `You are a ${p.type}${p.tendency ? ` with strong ${p.tendency} tendencies` : ""}.\n${LINES[p.type] || ""}\n\n` +
    `Wavelength: ${p.wavelength} / 10 (concrete to abstract).\n\nBring this with you to our next membership class. We'll talk through what fits and what doesn't.\n\n${p.church}`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [p.email], subject: `Your WAZE results · ${p.church}`, text }),
  });
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const origin = req.headers.get("origin");
  if (ALLOWED_ORIGIN && origin && origin !== ALLOWED_ORIGIN) return json(403, { error: "Origin not allowed" });
  if (!PCO_APP_ID || !PCO_SECRET) return json(500, { error: "Server is not configured" });

  let b;
  try { b = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }

  const p = {
    church: clean(b.church, 80) || "Soma City Church",
    name: clean(b.name, 100),
    email: clean(b.email, 200).toLowerCase(),
    type: clean(b.type, 20),
    tendency: b.tendency ? clean(b.tendency, 20) : null,
    wavelength: Number(b.wavelength),
    answers: Array.isArray(b.answers) ? b.answers.slice(0, 6).map(Number) : [],
    gutCheck: Number(b.gutCheck),
    reflections: (Array.isArray(b.reflections) ? b.reflections : []).slice(0, 5).map((r) => ({
      question: clean(r?.question, 200),
      answer: clean(r?.answer, 1500, true),
    })),
    submittedAt: b.submittedAt,
  };

  const validNums = p.answers.length === 6 && p.answers.every((n) => n >= 1 && n <= 10);
  if (p.name.split(/\s+/).length < 2 || !/^\S+@\S+\.\S+$/.test(p.email) || !LINES[p.type] || !validNums || !(p.wavelength >= 1 && p.wavelength <= 10))
    return json(400, { error: "Invalid submission" });

  try {
    const personId = await findOrCreatePerson(p.name, p.email);
    const cardId = await findOrCreateCard(personId);
    await pco(`/people/${personId}/workflow_cards/${cardId}/notes`, "POST", {
      data: { type: "WorkflowCardNote", attributes: { note: buildNote(p) } },
    });
    if (PCO_PROMOTE === "true") await pco(`/people/${personId}/workflow_cards/${cardId}/promote`, "POST").catch(() => {});
  } catch (err) {
    console.error(err);
    return json(502, { error: "Could not save to Planning Center" });
  }

  await sendSummary(p).catch((e) => console.error("Email failed", e));
  return json(200, { ok: true });
};
