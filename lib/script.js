// Writes the "In my town..." story script for an episode.
// Uses Claude when ANTHROPIC_API_KEY (or another SDK credential) is set,
// otherwise a deterministic template so the app works offline.
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";

// The show bible (STORY.md): world, rules, cast and the season arc. Read once at startup.
const BIBLE = fs.existsSync("STORY.md") ? fs.readFileSync("STORY.md", "utf8") : "";

const MOODS = ["day", "sunset", "night", "storm"];

const SCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "scenes", "next_options"],
  properties: {
    title: { type: "string" },
    next_options: {
      type: "array",
      description: "Exactly 3 different things that could happen next, each picking up right where the cliffhanger ends. Viewers vote on these.",
      items: { type: "string", description: "Third person, under 12 words, e.g. \"Ollie opens the letter\"." },
    },
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
- Scene 1's line MUST start with "In my town" and state ONE strange fact. It is the hook.
- Tell ONE continuous story that happens over a single day: every line is a new event that follows from the one before. Never restate a fact, a rule or the hook. If a line could be deleted without the story changing, cut it.
- 7 scenes, about 4 seconds each. Each line is under 14 words, plain, deadpan, no exclamation marks.
- Use the recurring cast: Ollie (narrator), Milo (best friend), Mrs. Pearl (old neighbour), the ducks (run the post office), the lighthouse, the town under the puddles. Name who does what.
- Escalate: normal, then slightly wrong, then unsettling.
- The LAST line is a cliffhanger: something new and unresolved happens, so viewers need the next episode. Never resolve it, never say "follow for part 2".
- next_options: exactly 3 choices for what happens next, each continuing directly from that cliffhanger. Make them clearly different (brave, scared, weird) and all fun to watch.
- If the viewers voted on this episode, scene 2 shows their choice happening and what it led to; the rest of the episode follows from that, and builds to a NEW cliffhanger. Don't re-explain the previous episode.
- Each scene shows its line literally on screen, so describe one clear, filmable action in "action".
- The hero avatar barely reacts: stands still, stares, slowly turns its head.
- Keep the recurring cast and places consistent with earlier episodes.
- Mention the coin's name or ticker at most once, naturally, never as financial advice.
- All-ages. No real people, brands, or real game titles.
${BIBLE ? `\nTHE SHOW BIBLE. Follow it exactly: the town, the rules of Ollie's power, the cast, and the season arc. The episode number tells you which row of the arc to tell; the viewers' vote decides how scene 2 plays out inside that row.\n\n${BIBLE}` : ""}`;

let client = null;
function getClient() {
  if (process.env.SCRIPT_PROVIDER === "template") return null;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  client ??= new Anthropic();
  return client;
}

export async function writeScript(coin, episodeNumber, previousTitles = [], premise = null, lastCliffhanger = null) {
  const c = getClient();
  if (c) {
    try {
      return { ...(await claudeScript(c, coin, episodeNumber, previousTitles, premise, lastCliffhanger)), source: "claude" };
    } catch (err) {
      console.warn("[script] Claude failed, using template:", err?.status ?? "", err?.message);
    }
  }
  return { ...templateScript(coin, episodeNumber), source: "template" };
}

async function claudeScript(c, coin, n, previousTitles, premise, lastCliffhanger) {
  const prompt = `Coin: ${coin.name} ($${coin.ticker})
Town name: ${coin.town}
Creator's town facts:
- What's strange about it: ${coin.facts.weird}
- Who lives there: ${coin.facts.who}
- What happens at night: ${coin.facts.night}
Episode: ${n}${previousTitles.length ? `\nEarlier episodes: ${previousTitles.join(" | ")}. Continue the story; don't repeat jokes.` : ""}${lastCliffhanger ? `\nLast episode ended on this cliffhanger: "${lastCliffhanger}"` : ""}${premise ? `\nThe viewers voted on what happens next. Build the whole episode around this: "${premise}"` : ""}`;

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
  // Hard limits, whatever the model returns: every scene is a paid clip.
  if (out.scenes.length > 8) out.scenes = [...out.scenes.slice(0, 7), out.scenes.at(-1)];
  for (const sc of out.scenes) { sc.line = String(sc.line).slice(0, 160); sc.setting = String(sc.setting).slice(0, 200); sc.action = String(sc.action).slice(0, 300); }
  out.title = String(out.title || "").slice(0, 120);
  if (!/^in my town/i.test(out.scenes[0].line)) out.scenes[0].line = "In my town, " + out.scenes[0].line;
  const opts = (out.next_options || []).map((o) => String(o).trim().slice(0, 90)).filter(Boolean);
  out.nextOptions = opts.length >= 3 ? opts.slice(0, 3) : CLIFFHANGERS[(n - 1) % CLIFFHANGERS.length][1];
  delete out.next_options;
  return out;
}

// ---- Offline template -------------------------------------------------------
// Lowercase the first word only when it's an ordinary word ("The ducks…" -> "the ducks…"), never a name ("Mrs. Pearl", "Milo").
const COMMON_START = /^(the|a|an|every|everyone|everybody|our|it|its|there|people|nobody|no|all|some|my|we|they|this|that|each|at|in|on|if|when)\b/i;
const lc = (s) => { const t = s.trim().replace(/[.!]+$/, ""); return COMMON_START.test(t) ? t.replace(/^./, (m) => m.toLowerCase()) : t; };

// ---- Offline fallback ----------------------------------------------------------
// Only the pilot (STORY.md) is scripted offline. Later episodes need Claude; without it the episode
// is refunded and retried on the next trade, so a wrong story never airs.
const PILOT = {
  scenes: [
    { line: "In my town, everyone launches memecoins. Everyone.", setting: "the Launch Pad square at noon", action: "a duck presses a big red button, a firework goes up and a coin shoots into the sky, Ollie in the foreground deadpan to camera", mood: "day" },
    { line: "The KOLs live on the Hill. Retail lives down here, in the Flats.", setting: "wide view of the Hill's glass towers above the flooded Flats", action: "Ollie stands on a plank dock looking up at green chart screens on the towers, grey dead coins float in the water", mood: "day" },
    { line: "My best friend Milo launched a coin this morning. It's already at zero.", setting: "plank dock in the Flats", action: "Milo holds up a cracked phone with a flat red line, mouth open, Ollie beside him not reacting", mood: "day" },
    { line: "I have a thing I don't talk about. When I look at a chart, the winning trade glows green.", setting: "close on Ollie's face lit by a phone", action: "one candle on the chart glows bright green and reflects in Ollie's eye", mood: "sunset" },
    { line: "If the KOLs find out, I'm gone. So I lose on purpose. In public.", setting: "town square under a giant screen showing a Caller's face", action: "Ollie holds up a phone with a red chart, kids around him laugh, he shrugs", mood: "sunset" },
    { line: "At night I trade alone. My wallet is bigger than the Whale's. Nobody knows.", setting: "Ollie's dark bedroom", action: "Ollie lifts a floorboard, a phone glows green underneath and lights his face from below", mood: "night" },
    { line: "Tonight, one of the Whale's Bots stopped outside my window. It turned its head.", setting: "Ollie's bedroom window at night", action: "through the window a grey faceless block avatar stands in the rain with its head turned toward us, Ollie frozen beside the curtain", mood: "night" },
  ],
  next: ["Ollie goes outside to face the Bot", "Ollie hides the phone and runs to Mrs. Pearl", "Milo bangs on the door with a new coin idea"],
};
const CLIFFHANGERS = [[PILOT.scenes.at(-1).line, PILOT.next]];

function templateScript(coin, n) {
  if (n !== 1) throw new Error("The offline writer only has the pilot. Episode " + n + " needs Claude (ANTHROPIC_API_KEY).");
  return { title: `${coin.town} — chapter 1: ${PILOT.scenes.at(-1).line.replace(/[.!]+$/, "")}`, scenes: PILOT.scenes.map((x) => ({ ...x })), nextOptions: PILOT.next };
}

// Text-to-video prompt for one scene, used by real video providers.
// The show bible, repeated in every scene prompt so clips stay consistent (see STYLE.md).
export const CHARACTER = "Ollie, a classic Roblox-style block avatar (cylinder head with a flat top, block torso and straight block limbs, no hands or feet, a flat 2D anime-eye face decal with eyebrows and a small mouth), beige skin, short messy brown hair mesh, small yellow bucket rain hat, yellow raincoat with three dark buttons, navy pants and boots, usually holding a cracked block phone";
// The supporting cast, described the same way in every prompt so they look the same in every scene.
export const CAST = "Milo: a Roblox-style block avatar boy, Ollie's age, light brown skin, black spiky hair mesh, round black goggles pushed up on his head, red scarf, green hoodie, grey shorts. Mrs. Pearl: an elderly Roblox-style block avatar woman, pale skin, grey hair in a bun, round glasses, purple knitted shawl over a dark dress. The Whale: a huge Roblox-style block avatar man in a white suit, thick gold chain, dark sunglasses, slicked black hair. The Callers: three identical Roblox-style block avatars in shiny black puffer jackets with glowing ring lights strapped to their heads. The Bots: plain grey Roblox-style block avatars with blank faces (no face decal), walking in lines. The ducks: plain white block-built ducks with orange beaks, each wearing a tiny blue postal cap";
export const WORLD = "bright in-game screenshot of a blocky online game map built from simple parts: Candlewick, a memecoin town. The Flats: flooded pastel block streets patched with cardboard, wooden plank docks, colourful block rowboats, small grey dead coins floating in the water, cracked phones everywhere. The Hill above: glass block towers with giant green chart screens on them, gold block fountains. The Launch Pad: a concrete square with a big red button and fireworks. Light rain, even game lighting, saturated colours";

// Text-to-video prompt for one scene, used by real video providers.
export function scenePrompt(coin, scene) {
  return [
    `Vertical 9:16 shot in the town of ${coin.town}. ${WORLD}.`,
    `Hero: ${CHARACTER}. Keep the design identical in every shot. Other recurring characters, only when the action names them: ${CAST}.`,
    `Setting: ${scene.setting}. Action: ${scene.action}. Lighting: ${scene.mood}.`,
    "Slow smooth camera push-in, deadpan stillness, leave the upper third of the frame clear.",
    "Audio: ambient sound only, no music, no speech. No text, no logos, no real brands.",
  ].join(" ");
}
