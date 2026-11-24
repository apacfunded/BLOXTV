// Writes the "In my town..." story script for an episode.
// Uses Claude when ANTHROPIC_API_KEY (or another SDK credential) is set,
// otherwise a deterministic template so the app works offline.
import Anthropic from "@anthropic-ai/sdk";

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
- All-ages. No real people, brands, or real game titles.`;

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
  return { ...templateScript(coin, episodeNumber, premise), source: "template" };
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

// ---- Offline story bank ------------------------------------------------------
// One continuous serial, six chapters that loop. Each chapter: a hook, the payoff of what the
// viewers voted (scene 2), four escalating beats that each add something NEW, and a cliffhanger
// whose 3 follow-ups are the next vote. Nothing is repeated inside a chapter.
const P = "Puddleton"; // placeholder, replaced with the coin's town name
const STORIES = [
  { // 1: the glowing puddle
    scenes: [
      { line: `In my town, it has rained for four hundred years, so everyone owns a boat.`, setting: `${P} main canal`, action: "Ollie stands on a dock and stares at the camera, boats drift past", mood: "day" },
      null,
      { line: "My best friend Milo lives three boats down.", setting: "row of block houses on the canal", action: "Milo waves stiffly from a small rowboat", mood: "day" },
      { line: "The ducks run the post office. Today they delivered a letter to the wrong house. Mine.", setting: "post office counter", action: "a duck in a tiny cap slides an envelope across the counter", mood: "day" },
      { line: "It said: don't look at the puddles tonight.", setting: "Ollie's bedroom", action: "Ollie holds the letter up, reads it, slowly lowers it", mood: "sunset" },
      { line: "Mrs. Pearl next door said the ducks are never wrong.", setting: "Mrs. Pearl's porch", action: "an old lady avatar in a shawl shakes her head slowly", mood: "sunset" },
    ],
    cliff: { line: "Tonight, the puddle outside my house started glowing.", setting: "Ollie's bedroom window at night", action: "Ollie freezes, slowly turns to the window, a green glow rises from below", mood: "night" },
    next: ["Ollie looks into the glowing puddle", "Ollie runs to Mrs. Pearl for help", "The copy of Milo knocks on Ollie's door"],
    payoffs: {
      "Ollie looks into the glowing puddle": ["I looked. There was a town under the water. Someone down there waved.", "glowing puddle outside the house", "Ollie leans over the puddle, a second town shines under the water", "night"],
      "Ollie runs to Mrs. Pearl for help": ["I ran to Mrs. Pearl. Her door was open. Her house was empty.", "Mrs. Pearl's dark doorway", "Ollie stands in an open doorway, the room behind is empty", "night"],
      "The copy of Milo knocks on Ollie's door": ["Someone knocked. It was Milo. But Milo was also standing behind me.", "Ollie's front door", "Milo at the door, an identical Milo stands behind Ollie", "night"],
    } },
  { // 2: the letter from tomorrow
    scenes: [
      { line: "In my town, the puddles show another town underneath. Last night, mine glowed.", setting: "canal street in the morning", action: "Ollie walks past puddles that reflect a wrong, upside-down town", mood: "day" },
      null,
      { line: "The next morning, everyone acted normal. Too normal.", setting: "busy dock market", action: "neighbors smile and wave at Ollie in perfect unison", mood: "day" },
      { line: "Milo didn't remember last night. Milo didn't remember anything.", setting: "school boat", action: "Milo stares blankly, Ollie waves a hand in front of his face", mood: "day" },
      { line: "The ducks closed the post office. The sign said: no more letters. Ever.", setting: "post office with a closed sign", action: "a duck turns a sign on the door, lights go off inside", mood: "sunset" },
      { line: "Then a duck came to my door anyway. It looked scared.", setting: "Ollie's front door", action: "a single duck on the step, shaking, holding an envelope in its beak", mood: "sunset" },
    ],
    cliff: { line: "It delivered a letter with my name on it. It's from tomorrow.", setting: "Ollie's bedroom", action: "Ollie holds an envelope with tomorrow's date stamped on it, lights flicker", mood: "night" },
    next: ["Ollie opens the letter", "Ollie burns the letter", "The ducks come back for a reply"],
    payoffs: {
      "Ollie opens the letter": ["I opened it. It just said: the lighthouse. Don't be late.", "Ollie's bedroom", "Ollie unfolds the letter, two words on it", "night"],
      "Ollie burns the letter": ["I burned it. The ashes spelled: the lighthouse.", "kitchen stove", "ashes drift up and settle into letters", "night"],
      "The ducks come back for a reply": ["The ducks came back for a reply. I didn't have one. They took my boat.", "dock", "ducks row away in Ollie's boat while Ollie stands on the dock", "night"],
    } },
  { // 3: the lighthouse
    scenes: [
      { line: "In my town, the lighthouse has never turned on. Nobody knows who built it.", setting: "red and white lighthouse on the rocks", action: "Ollie stares up at the dark lighthouse, rain streaks past", mood: "day" },
      null,
      { line: "Mrs. Pearl said her grandmother said the same thing. Then she stopped talking.", setting: "Mrs. Pearl's porch", action: "Mrs. Pearl's mouth closes mid-sentence, she looks at the lighthouse", mood: "day" },
      { line: "Milo rowed past it and came back with wet hair. It wasn't raining.", setting: "canal near the lighthouse", action: "Milo rows back, dripping, under a clear patch of sky", mood: "day" },
      { line: "At school we learned the town's history. The lighthouse was not in it.", setting: "classroom with a town map", action: "a teacher points at a map, the lighthouse spot is blank", mood: "sunset" },
      { line: "Tonight the rain got quieter. Like it was listening.", setting: "empty dock at dusk", action: "raindrops slow down, Ollie looks around", mood: "sunset" },
    ],
    cliff: { line: "The lighthouse turned on. It's never turned on before.", setting: "lighthouse at night", action: "the lamp blazes on, the beam sweeps across Ollie's frozen face", mood: "night" },
    next: ["Ollie rows out to the lighthouse", "Mrs. Pearl tells Ollie the truth about it", "Every boat in town starts moving toward it"],
    payoffs: {
      "Ollie rows out to the lighthouse": ["I rowed out. The door was unlocked. The stairs went down, not up.", "inside the lighthouse door", "Ollie peers down a spiral staircase descending into dark water", "night"],
      "Mrs. Pearl tells Ollie the truth about it": ["Mrs. Pearl told me the truth. The lighthouse isn't ours. It's theirs, from underneath.", "Mrs. Pearl's kitchen", "Mrs. Pearl points down at the floor, Ollie stares", "night"],
      "Every boat in town starts moving toward it": ["Every boat in town started moving toward it. Nobody was rowing.", "canal full of boats", "dozens of empty boats glide toward the lighthouse beam", "night"],
    } },
  { // 4: the rain stops
    scenes: [
      { line: "In my town, it has rained for four hundred years. Not one dry day.", setting: "rooftops in the rain", action: "Ollie on a roof, rain everywhere, arms at his sides", mood: "day" },
      null,
      { line: "Then the lighthouse went dark again, and the ducks came back to work like nothing happened.", setting: "post office reopening", action: "ducks flip the sign to open, the lighthouse behind is dark", mood: "day" },
      { line: "Milo said he saw a boy in the water who looked like me. I told him to stop.", setting: "dock edge", action: "Milo points at the water, Ollie doesn't look", mood: "day" },
      { line: "Mrs. Pearl started packing. She said she was going up. Up doesn't exist here.", setting: "Mrs. Pearl's doorway with suitcases", action: "Mrs. Pearl drags a suitcase, points at the sky", mood: "sunset" },
      { line: "The puddles went still. Completely still.", setting: "street of puddles", action: "raindrops hit puddles but no ripples appear", mood: "sunset" },
    ],
    cliff: { line: "The rain stopped. Everyone in town is staring at the sky.", setting: "town square", action: "every avatar stands frozen, heads tilted up, the rain gone", mood: "night" },
    next: ["Something falls from the sky", "Ollie's reflection steps out of a puddle", "The rain starts again, but upward"],
    payoffs: {
      "Something falls from the sky": ["Something fell from the sky. It was a boat. It was my boat.", "town square", "a rowboat crashes down onto the cobbles, Ollie's name on its side", "day"],
      "Ollie's reflection steps out of a puddle": ["My reflection stepped out of a puddle and shook my hand. It was warm.", "street puddle", "a second Ollie climbs out of a puddle and offers a hand", "day"],
      "The rain starts again, but upward": ["The rain started again. Upward.", "canal street", "raindrops rise from the water into the sky", "day"],
    } },
  { // 5: two Milos
    scenes: [
      { line: "In my town, the sky did something it had never done. Now nobody trusts the weather.", setting: "canal street, people looking up nervously", action: "neighbors hold umbrellas upside down, Ollie watches them", mood: "day" },
      null,
      { line: "School was cancelled. The ducks delivered the news by hand, which they hate.", setting: "school boat with a closed sign", action: "grumpy ducks hand out notes door to door", mood: "day" },
      { line: "Mrs. Pearl's house is empty now. Her boat is still tied up.", setting: "Mrs. Pearl's empty house", action: "Ollie peers through a dark window, a boat bobs at the dock", mood: "sunset" },
      { line: "I went to find Milo. His mom said he'd been home all day.", setting: "Milo's front door", action: "Milo's mom shrugs in the doorway", mood: "sunset" },
      { line: "He was. He was sitting on the roof, waving at the water.", setting: "Milo's roof", action: "Milo sits on the roof edge waving slowly at the canal", mood: "sunset" },
    ],
    cliff: { line: "Milo came home. But Milo never left.", setting: "Milo's front door at night", action: "a soaked Milo walks up the path while the roof Milo keeps waving", mood: "night" },
    next: ["Ollie asks both Milos a question only the real one knows", "Ollie follows the new Milo", "Mrs. Pearl locks her door and won't answer"],
    payoffs: {
      "Ollie asks both Milos a question only the real one knows": ["I asked both Milos our secret word. Both got it right.", "Milo's living room", "two identical Milos answer at the same time, Ollie steps back", "night"],
      "Ollie follows the new Milo": ["I followed the new Milo. He walked straight into the canal and kept walking.", "canal edge", "Milo walks down into the water until only his hair shows", "night"],
      "Mrs. Pearl locks her door and won't answer": ["Mrs. Pearl was back. She locked her door and whispered through it.", "Mrs. Pearl's door", "Ollie leans an ear to a locked door, a shadow moves inside", "night"],
    } },
  { // 6: the only real one
    scenes: [
      { line: "In my town, there are two of my best friend now. Only one of them blinks.", setting: "school boat", action: "two Milos sit side by side, one blinks, one doesn't", mood: "day" },
      null,
      { line: "The ducks won't deliver to Milo's house anymore. Either one.", setting: "Milo's mailbox", action: "a duck walks past the mailbox without stopping", mood: "day" },
      { line: "I checked the whole town. Everyone has a reflection except me.", setting: "canal edge with reflections", action: "neighbors' reflections shine in the water, Ollie's spot is empty", mood: "day" },
      { line: "The lighthouse blinked twice. The Milo who blinks blinked back.", setting: "dock facing the lighthouse", action: "the lighthouse flashes twice, Milo blinks twice", mood: "sunset" },
      { line: "The ducks gave me one last letter. It was blank.", setting: "Ollie's doorstep", action: "Ollie unfolds an empty page", mood: "sunset" },
    ],
    cliff: { line: "Mrs. Pearl just whispered: you're the only one left who's real.", setting: "Mrs. Pearl's window at night", action: "Mrs. Pearl's face at the glass, lips moving, Ollie frozen on the path", mood: "night" },
    next: ["Ollie checks his own reflection", "Ollie runs to find Milo", "Mrs. Pearl vanishes into the rain"],
    payoffs: {
      "Ollie checks his own reflection": ["I checked my reflection. It was late. It arrived a second after me.", "puddle", "Ollie looks down, his reflection appears a beat later", "night"],
      "Ollie runs to find Milo": ["I ran to find Milo. The real one was waiting at the dock with two boats.", "dock", "Milo stands by two boats and points at the far one", "night"],
      "Mrs. Pearl vanishes into the rain": ["Mrs. Pearl walked into the rain and didn't come out the other side.", "rainy street", "Mrs. Pearl fades into the rain curtain", "night"],
    } },
];
const CLIFFHANGERS = STORIES.map((s) => [s.cliff.line, s.next]);

function templateScript(coin, n, premise) {
  const t = coin.town;
  const story = STORIES[(n - 1) % STORIES.length];
  const prev = STORIES[(n - 2 + STORIES.length) % STORIES.length];
  const town = (x) => x.replaceAll(P, t);
  const scenes = story.scenes.map((s) => s && { ...s, line: town(s.line), setting: town(s.setting) });
  // Scene 2 pays off what the viewers voted at the end of the last episode.
  const known = n > 1 && premise && prev.payoffs[premise];
  scenes[1] = known
    ? { line: known[0], setting: known[1], action: known[2], mood: known[3] }
    : premise ? { line: `Last night, ${lc(premise)}. I saw it happen.`, setting: `${t} canal at night`, action: "Ollie stands very still, staring at the water", mood: "night" }
    : { line: "I'm Ollie. I've lived here my whole life, and I thought I knew it.", setting: `${t} dock`, action: "Ollie turns slowly to the camera", mood: "day" };
  scenes.push({ ...story.cliff, setting: town(story.cliff.setting) });
  return { title: `${t} — chapter ${n}: ${story.cliff.line.replace(/[.!]+$/, "")}`, scenes, nextOptions: story.next };
}

// Text-to-video prompt for one scene, used by real video providers.
// The show bible, repeated in every scene prompt so clips stay consistent (see STYLE.md).
export const CHARACTER = "Ollie, a classic Roblox-style block avatar (cylinder head with a flat top, block torso and straight block limbs, no hands or feet, a flat 2D anime-eye face decal with eyebrows and a small mouth), beige skin, short messy brown hair mesh, small yellow bucket rain hat, yellow raincoat with three dark buttons, navy pants and boots";
// The supporting cast, described the same way in every prompt so they look the same in every scene.
export const CAST = "Milo: a Roblox-style block avatar boy, Ollie's age, light brown skin, black spiky hair mesh, round black goggles pushed up on his head, red scarf, green hoodie, grey shorts. Mrs. Pearl: an elderly Roblox-style block avatar woman, pale skin, grey hair in a bun, round glasses, purple knitted shawl over a dark dress. The ducks: plain white block-built ducks with orange beaks, each wearing a tiny blue postal cap";
export const WORLD = "bright in-game screenshot of a blocky online game map built from simple parts: Puddleton, a canal street flooded with flat blue water, wooden plank docks, colourful block rowboats, pastel block houses with white window frames, a red-and-white lighthouse, light rain, even game lighting, saturated colours";

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
