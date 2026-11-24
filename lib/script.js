// Writes the "In my town..." story script for an episode.
// Uses Claude when ANTHROPIC_API_KEY (or another SDK credential) is set,
// otherwise a deterministic template so the app works offline.
import Anthropic from "@anthropic-ai/sdk";

const MOODS = ["day", "sunset", "night", "storm"];

const SCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "scenes"],
  properties: {
    title: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["line", "setting", "action", "mood"],
        properties: {
          line: { type: "string", description: "Narration, first person, under 18 words." },
          setting: { type: "string", description: "Where the shot is, in blocky game-world terms." },
          action: { type: "string", description: "What the avatar(s) do on screen." },
          mood: { type: "string", enum: MOODS },
        },
      },
    },
  },
};

const SYSTEM = `You write scripts for short vertical videos in the viral "In my town..." / "In this town..." format:
a blocky toy-like game avatar narrates absurd, slightly creepy rules about their town, one rule per shot,
read by a flat, calm, monotone narrator. See STYLE.md for the show bible.
Rules:
- Scene 1's line MUST start with "In my town" and state the strangest fact. It is the hook.
- 6 to 8 scenes, about 4 seconds each. Each line is under 14 words, plain, deadpan, no exclamation marks.
- Escalate: funny, then slightly wrong, then unsettling. The last line is a quiet twist or cliffhanger.
- Each scene shows its line literally on screen, so describe one clear, filmable action in "action".
- The hero avatar barely reacts: stands still, stares, slowly turns its head.
- Keep the recurring cast and places consistent with earlier episodes.
- Mention the coin's name or ticker at most once, naturally, never as financial advice.
- All-ages. No real people, brands, or real game titles.`;

let client = null;
function getClient() {
  if (process.env.SCRIPT_PROVIDER === "template") return null;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  client ??= new Anthropic();
  return client;
}

export async function writeScript(coin, episodeNumber, previousTitles = [], premise = null) {
  const c = getClient();
  if (c) {
    try {
      return { ...(await claudeScript(c, coin, episodeNumber, previousTitles, premise)), source: "claude" };
    } catch (err) {
      console.warn("[script] Claude failed, using template:", err?.status ?? "", err?.message);
    }
  }
  return { ...templateScript(coin, episodeNumber, premise), source: "template" };
}

async function claudeScript(c, coin, n, previousTitles, premise) {
  const prompt = `Coin: ${coin.name} ($${coin.ticker})
Town name: ${coin.town}
Creator's town facts:
- What's strange about it: ${coin.facts.weird}
- Who lives there: ${coin.facts.who}
- What happens at night: ${coin.facts.night}
Episode: ${n}${previousTitles.length ? `\nEarlier episodes: ${previousTitles.join(" | ")}. Continue the story; don't repeat jokes.` : ""}${premise ? `\nThe viewers voted on what happens this episode. Build the whole episode around this: "${premise}"` : ""}`;

  const res = await c.beta.messages.create({
    model: process.env.SCRIPT_MODEL || "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCRIPT_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason !== "end_turn") throw new Error(`stop_reason ${res.stop_reason}`);
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const out = JSON.parse(text);
  if (!out.scenes?.length) throw new Error("empty script");
  if (!/^in my town/i.test(out.scenes[0].line)) out.scenes[0].line = "In my town, " + out.scenes[0].line;
  return out;
}

// ---- Offline template -------------------------------------------------------
function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const lc = (s) => s.trim().replace(/[.!]+$/, "").replace(/^./, (m) => m.toLowerCase());

function templateScript(coin, n, premise) {
  const r = rng(coin.id + ":" + n);
  const t = coin.town;
  const extras = [
    ["the mayor is a dog and nobody questions it", "town hall steps", "a dog in a tiny hat stamps papers"],
    ["the bus only stops if you dance", "bus stop", "avatar does a stiff blocky dance, bus screeches in"],
    ["we pay for snacks with compliments", "corner store", "avatar bows to the cashier"],
    ["the river flows uphill on Tuesdays", "river bank", "water climbs a hill, fish look confused"],
    ["every house has exactly one door, but it's on the roof", "suburb street", "avatars climb ladders to get home"],
    ["the weather is decided by a coin flip", "town square", "a giant coin spins in the sky"],
    [`everyone holds $${coin.ticker} and nobody can explain why`, "the bank", "avatars hold glowing coins and shrug"],
  ];
  const a = pick(r, extras), b = pick(r, extras.filter((x) => x !== a));
  const scenes = [
    { line: `In my town, ${lc(coin.facts.weird)}.`, setting: `${t} main street`, action: "avatar turns to camera, deadpan", mood: "day" },
    { line: `Our neighbors? ${coin.facts.who.trim().replace(/[.!]+$/, "")}.`, setting: "neighborhood block", action: "neighbors wave in unison", mood: "day" },
    { line: `In my town, ${a[0]}.`, setting: a[1], action: a[2], mood: "sunset" },
    { line: `Also, ${b[0]}.`, setting: b[1], action: b[2], mood: "sunset" },
    { line: `But at night... ${lc(coin.facts.night)}.`, setting: `${t} at night`, action: "street lights flicker, avatar hides behind a block", mood: "night" },
    { line: n > 1 ? `Last time I told you about ${t}. They didn't like that.` : `Nobody leaves ${t}. Nobody wants to.`, setting: "town gate", action: "the gate slowly closes", mood: "storm" },
    { line: `Follow for part ${n + 1}. If I'm still here.`, setting: "avatar bedroom", action: "lights cut out", mood: "night" },
  ];
  if (n > 1) { // later episodes open on a new fact so every episode hooks differently
    scenes[0].line = `In my town, ${a[0]}.`;
    scenes[2].line = `And yes, ${lc(coin.facts.weird)}. Still.`;
  }
  if (premise) { // the viewers' vote becomes the episode's main event
    scenes[0].line = `In my town, ${lc(premise)}.`;
    scenes[3].line = `You voted for this. I just live here.`;
    scenes[5].line = `${premise.trim().replace(/[.!]+$/, "")}. That was yesterday. Today is worse.`;
  }
  return { title: `In my town: ${t} — part ${n}`, scenes };
}

// Text-to-video prompt for one scene, used by real video providers.
// The show bible, repeated in every scene prompt so clips stay consistent (see STYLE.md).
export const CHARACTER = "an original blocky toy-like game avatar with a large square beige head, painted deadpan face (two small black oval eyes, flat line mouth), glossy yellow raincoat, small yellow bucket hat, navy blocky legs and glossy navy rubber boots";
export const WORLD = "stylized low-poly 3D game engine render, smooth plastic toy materials, chunky pastel blocky buildings (sage, dusty pink, pale teal, cream), constant gentle rain, streets flooded with calm reflective water, rowboats and wooden docks, soft overcast light or deep blue night, light fog";

// Text-to-video prompt for one scene, used by real video providers.
export function scenePrompt(coin, scene) {
  return [
    `Vertical 9:16 shot in the town of ${coin.town}. ${WORLD}.`,
    `Hero: ${CHARACTER}. Keep the design identical in every shot.`,
    `Setting: ${scene.setting}. Action: ${scene.action}. Lighting: ${scene.mood}.`,
    "Slow smooth camera push-in, deadpan stillness, leave the upper third of the frame clear.",
    "Audio: ambient sound only, no music, no speech. No text, no logos, no real brands.",
  ].join(" ");
}
