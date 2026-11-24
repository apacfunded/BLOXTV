# "Every coin gets its own show" — launchpad ad, full production prompt

Vertical 9:16 short, 1080x1920, 30fps, about 25 seconds. One continuous "In my town…" story in the style of the viral blocky-avatar story shorts (reference: "In My Town Roblox Stories Compilation", ToonAnarchy). Seven scenes, hard cuts, each scene 3–4 seconds, one spoken line per scene, one caption word at a time.

---

## 1. Global visual style (paste into every scene prompt)

Classic Roblox-style avatars as rendered in-game: a cylinder head with a flat top, a rectangular block torso, straight block arms and legs with no separate hands or feet, stiff joints. The face is a flat 2D decal on the front of the head (large expressive anime-style eyes with highlights, thin eyebrows, a small simple mouth; no 3D nose or lips). Hair is a chunky separate mesh on top of the head; clothes are flat textures on the blocks plus a few simple accessory meshes. Matte plastic with soft, even game-engine lighting and slight glossy highlights, saturated colours, crisp edges, like a high-quality in-game screenshot. Towns are built from simple blocks and parts like a game map. No real brand logos, no readable in-world text, no watermark, no real people. Camera is mostly a chest-up close-up of a character talking straight into the lens, centred, with the upper third of the frame kept clean for captions.

## 2. Cast (keep identical in every shot)

**Master reference: `ads/reference-sheet-roblox.png`** (Higgsfield job `51de834d-e1d6-46ef-8e07-450b2259d23f`; the earlier `reference-sheet.png` is superseded). One image, 2 rows: top row the four narrator kids full body, bottom row their four towns, each town directly under its kid. Attach this single image as the style and identity reference to every keyframe and every video clip. Describe the character in words as well, so the model never has to guess which of the four it is.

- **Ollie** (narrator, hero; sheet top row, 1st): warm beige skin, short messy brown hair with a swept fringe, small glossy yellow bucket rain hat, glossy bright yellow raincoat with a hood down, two chest pockets and three dark buttons, dark navy undershirt showing at the collar, navy pants, glossy navy rubber boots. Friendly, slightly tired, earnest face: round open mouth, raised inner eyebrows.
- **Dune** (desert kid; sheet top row, 2nd): tan skin, spiky messy black hair, brass aviator goggles with dark lenses pushed up on the forehead, bright red bandana knotted at the side of the neck, sand-coloured utility vest with pockets over a white short-sleeve tee, brown belt with a brass buckle, brown cargo shorts, brown sandals. One eye squinted shut, wide cheeky grin.
- **Frost** (snow kid; sheet top row, 3rd): pale skin with pink blush cheeks, light blond hair, white cable-knit beanie with a big pom-pom, puffy sky-blue quilted winter coat with a zipper and small reflective strips on the pockets, light grey mittens, grey pants, brown fur-topped snow boots with white laces. Wide innocent eyes, small open "oh" mouth.
- **Ember** (volcano kid; sheet top row, 4th): dark brown skin, short curly dark hair, bright orange pullover hoodie with the hood down, white drawstrings and a front pocket, black shorts, red high-top sneakers with white laces and soles. Confident half-smile, eyebrows relaxed, one eyebrow slightly raised.

All four: same R15-style block proportions (cylinder head about one third of total height, block torso, block arms and legs, no hands or feet), the same flat face-decal style, the same matte plastic. Expressions change by swapping the face decal, never by deforming the head. They never change outfit, hair or colours between shots.

## 3. Towns (sheet bottom row, same order as the kids)

- **Puddleton** (Ollie; sheet 1st): canal main street flooded with clear sparkling blue water, wooden plank docks on both sides with rope posts, colourful wooden rowboats (red, yellow, blue) moored where cars would be, two-storey pastel blocky houses (mint, pink, sky blue, butter yellow) with white window frames, flower boxes and little lanterns, a red-and-white striped lighthouse on a green hill at the end of the street, light steady rain with ripples, bright soft daylight, blocky white clouds.
- **Dustmoor** (Dune; sheet 2nd): blocky desert town at golden hour, flat-roofed sandstone cube houses with red awnings and hanging lanterns, wooden crates by the doors, a wooden water tower on stilts, bright green blocky saguaro cacti, a sandy main street with long warm shadows, a huge orange setting sun between the buildings, layered mesas in the background, orange-pink sky.
- **Hollowfrost** (Frost; sheet 3rd): blocky snow village at dusk, dark log cabins with thick snow-capped roofs and warm yellow windows, smoke from chimneys, chunky dark-green pine trees dusted with snow, a frozen pond with cracks reflecting the sky in the middle of the village, three identical snowmen with coal eyes, carrot noses and red scarves standing in a row, soft falling snow, a snowy mountain behind, deep blue-violet sky with stars.
- **Cindervale** (Ember; sheet 4th): blocky volcano town at night, dark basalt-grey stone houses with pitched roofs, glowing orange windows and red banners with a flame mark, a bright glowing orange-yellow lava river running down the middle of the main street like a canal with stone banks, floating embers, a huge smoking volcano behind the town with lava on its slopes, dark red-black sky, everything lit warm orange from below.

## 3b. Shot grammar (what makes the reference shorts look the way they do)

- The narrator fills the lower two thirds of the frame, centred, chest-up, head slightly below the top third, looking straight down the lens. Eyes and mouth animate with the words; the body barely moves.
- Backgrounds are the town's main street, slightly soft (shallow depth of field), always with something alive in them: rain, drifting sand, falling snow, floating embers.
- One slow camera move per shot: a gentle push-in of about 5% over the shot, or a locked-off frame when something behind the narrator has to move.
- **Movement is Roblox movement:** the whole body sways with the standard idle animation, the character turns from the torso rather than the neck, arms swing stiffly from the shoulder, and emotes are simple (wave, point, nod). Limbs never bend; the face decal swaps between neutral, talking and shocked instead of the mouth animating. Tell the video model this in every clip prompt.
- Every scene is a hard cut on the first word of the next line. Nothing lingers.
- Big friendly colours even in the scary moments; the scary thing is always one small wrong detail (three heads turning, a wave from the lava), never gore or darkness.

## 4. Audio

**Narration voice (to match the reference shorts):** a calm, flat, slightly deadpan male AI-TTS narrator, mid-pitch to slightly deep, clear studio-quality, no reverb, unhurried, with a small pause after each sentence. Delivery is matter-of-fact even when the line is strange, which is what makes it funny and a little eerie. Same voice for Ollie's lines; each new kid gets the same voice at a slightly different pitch (Dune a touch lower, Frost a touch higher, Ember the same as Ollie) so it still reads as one show. Generate with ElevenLabs, stability high, style low, speed 0.95.
*Exact voice to confirm against the reference video. Closest stock ElevenLabs options: "Adam", "Brian", or "Daniel".*

**Music (to match the reference shorts):** one soft, slightly unsettling music-box / felt-piano loop in a minor key, slow (about 70 bpm), with a light lo-fi tape hiss, low in the mix under the voice (voice at -14 LUFS, music about 14 dB under it). It should feel cosy but wrong, like a lullaby in a horror game. No drums, no bass drop. Runs under the whole ad and fades out over the final title card.
*Exact track to confirm against the reference video.*

**Effects:** each scene keeps its own ambient bed: rain and water (Puddleton), dry wind and sand hiss (Dustmoor), muffled snow silence with a faint wind (Hollowfrost), lava bubbling and ember crackle (Cindervale). One soft "whoosh" on every cut. A soft low "thud" when the title card lands.

## 5. Captions

One word at a time, lowercase, centred just below the middle of the frame, Montserrat ExtraBold, white fill with a thick black outline and a soft black drop shadow, each word popping in with a quick 85%→100% scale over 80 ms, timed exactly to the spoken word. No punctuation in the captions. The words are the only text on screen until the final title card.

---

## 6. Scenes

Every scene below is produced as: (a) one keyframe still from `reference-sheet.png` plus the scene description, 9:16, (b) one video clip from that keyframe (`start_image`) with `reference-sheet.png` as the identity reference and the motion text as the prompt, 4 seconds, 480p draft, upscaled in the edit.

### Scene 1 (0.0–3.8s) — Hook
- **Line:** "In my town, every coin gets its own show."
- **Keyframe:** Chest-up close-up of Ollie (sheet top row 1st: yellow bucket hat, yellow raincoat), centred, standing on a wooden dock in Puddleton (sheet bottom row 1st), light rain, water drops on his hat and shoulders, red and yellow rowboats and pastel houses soft in the background, lighthouse far behind his left shoulder. Mouth open mid-word, eyebrows up, eyes on the lens.
- **Motion:** He talks straight to camera, mouth moving with the words, eyebrows rise on "every coin", a small shrug on "its own show". Rain falls, boats bob. Very slow push-in with a slight handheld drift.
- **Audio:** rain and water ambience, music loop starts under the first word.

### Scene 2 (3.8–7.6s) — The rule
- **Line:** "Every trade pays a fee. The fee pays for the next episode."
- **Keyframe:** Reuse scene 1's keyframe (no new image).
- **Motion:** Same framing, Ollie raises one blocky hand and points up and to the side on "fee", then nods on "episode". Locked-off camera. In the edit (free): a rounded blue progress bar labelled "next episode" slides in above his head and fills from 20% to 100% in sync with the line, with a small yellow coin icon dropping into it on "trade".
- **Audio:** rain, a soft "tick" each time the bar jumps, a gentle chime when it hits 100%.

### Scene 3 (7.6–11.2s) — Desert
- **Line:** "In my town, the sand moves at night."
- **Keyframe:** Chest-up close-up of Dune (sheet top row 2nd: goggles on forehead, red bandana, sand vest), centred, standing in the middle of Dustmoor's main street (sheet bottom row 2nd), the big orange sun and water tower behind him, long shadows, one eye squinted, cheeky grin, mouth open.
- **Motion:** He talks to camera, grin widening on "moves". Behind him the sand on the street slowly slides sideways like a tide and a blocky cactus leans a few degrees as if pushed. Warm dust drifts through the light. Slow push-in.
- **Audio:** dry wind, sand hiss, whoosh on the cut.

### Scene 4 (11.2–14.8s) — Snow
- **Line:** "In my town, the snowmen remember your name."
- **Keyframe:** Chest-up close-up of Frost (sheet top row 3rd: white pom-pom beanie, sky-blue puffer coat), centred, standing by the frozen pond in Hollowfrost (sheet bottom row 3rd), snow settling on the beanie, nervous small smile, eyes glancing to his right. Behind him, in focus enough to read, the three identical snowmen with red scarves stand in a row facing sideways.
- **Motion:** He talks to camera, eyes darting sideways on "snowmen". On "remember" all three snowman heads rotate together to face the camera and hold. Frost's smile freezes. Snow keeps falling. Locked-off camera.
- **Audio:** muffled snow quiet, faint wind, a tiny creak when the heads turn, whoosh on the cut.

### Scene 5 (14.8–18.4s) — Volcano
- **Line:** "In my town, the lava is warm. And it's friendly."
- **Keyframe:** Chest-up close-up of Ember (sheet top row 4th: orange hoodie, curly hair), centred, standing on the stone bank of the lava river in Cindervale (sheet bottom row 4th), orange light on his face from below, the volcano smoking behind his shoulder, relaxed half-smile, mouth open.
- **Motion:** He talks to camera, calm. Behind him the lava river flows slowly and embers float up. On "friendly" a small rounded blob of lava rises out of the river beside him and gives a little wave with a stubby arm, then sinks back. Ember doesn't react. Slow push-in.
- **Audio:** lava bubbling, ember crackle, whoosh on the cut.

### Scene 6 (18.4–22.0s) — The reveal
- **Line:** "Each town has its own coin. Each coin writes its own story."
- **Keyframe:** None. Built in the edit from the four narrator clips (scenes 1, 3, 4, 5).
- **Motion:** Four-way split screen, 2x2: Puddleton/Ollie top-left, Dustmoor/Dune top-right, Hollowfrost/Frost bottom-left, Cindervale/Ember bottom-right, all four talking at once with no sound except Ollie. Thin white dividers. On "its own story" all four tiles slowly push in together.
- **Audio:** Ollie's voice only, music swells slightly, all four ambiences mixed quietly.

### Scene 7 (22.0–26.0s) — Call to action
- **Line:** "Launch your town. Fees pay for the story."
- **Keyframe:** Medium shot of Ollie, head to knees, standing on the dock in Puddleton, rain, boats behind, looking at the lens with a calm closed-mouth smile, arms at his sides.
- **Motion:** He looks at the lens and gives one slow nod on "story", then a tiny wave. Rain falls. Locked-off camera. At 24.0s the picture dips to a deep navy card (edit, free): big white Montserrat ExtraBold title "IN MY TOWN", under it in smaller type the site address and "live on pump.fun", a tiny yellow blocky Ollie head as the icon, rain streaks over the card. Hold 2 seconds, fade out.
- **Audio:** rain, soft low thud when the card lands, music fades out with the card.

---

## 7. Budget (draft quality, what we'll actually spend)

| Item | Credits |
|---|---|
| Reference sheet (done) | 2 |
| 6 keyframes (scenes 1, 3, 4, 5, 7; scene 2 reuses scene 1's) | ~10 |
| 6 video clips x 4 s, 480p draft | ~72 |
| 7 narration lines, ElevenLabs | ~1 |
| Edit: captions, fund bar, split screen, title card, music mix, loudness | 0 |
| **Total** | **~85** |

Add ~15 per clip that needs a redo. The 1080p version of the same ad would be ~390.

## 8. Edit notes
- Hard cuts only, no dissolves except the final fade.
- Keep every narrator chest-up and centred so the eye never has to move between cuts.
- Captions hide during the title card.
- Export: H.264, 1080x1920, 30fps, AAC 192k, loudness -14 LUFS, true peak -1.5 dB.
