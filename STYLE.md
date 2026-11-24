# In My Town: style guide

How every episode should look and sound. Matched to the reference "In My Town Roblox Stories Compilation" (ToonAnarchy) and the "In my town / In this town" trend on TikTok and Reels.

## Format
- **Hook first.** Line 1 is "In my town, …" plus the strangest fact, spoken to camera by the main character.
- **One rule with stakes.** Each episode is built around one rule ("Never look into a glowing puddle") and what happens when someone breaks it. Thumbnail-style titles: "DON'T LOOK DOWN", "DON'T BLINK", "LAST LIFE LEFT…".
- **Escalation:** normal life, then the rule, then someone breaks it, then the consequence, then it comes for us. End on a cliffhanger.
- **6–8 scenes, 35–45 seconds.** Each line is short and plain, and one scene matches one line.

## Look
- **Standing references live in `reference/`** (clip, thumbnail, cast-and-towns sheet, voice ID, music). Attach the thumbnail and the cast sheet to every generation.
- A bright, clean blocky online-game render: smooth glossy plastic, saturated colours, simple geometry, like a game screenshot. Moody, foggy cinematic lighting is out.
- **Characters have very expressive faces:** big glossy eyes, eyebrows, open mouths. They talk to camera, look shocked, cry, or grin creepily.
- **Framing:** mostly chest-up close-ups of a character talking to camera, centred. Location and action shots in between.
- **Horror beats:** glowing eyes, too-wide smiles, faces at the window, characters frozen in place. Night scenes use deep blue with bright cyan glow.

## Cast (reference: `pilot/v2/cast.png`)
- **Ollie:** the hero and narrator. Messy brown hair, yellow bucket rain hat, glossy yellow raincoat, navy pants and boots.
- **Milo:** best friend. Spiky blond hair, mint green hoodie, grey shorts, white sneakers. Since Ep 1 there is also a copy with glowing cyan eyes.
- **Mrs. Pearl:** old neighbour who knows the rules. White hair bun, round black glasses, lavender cardigan, grey skirt.

## Town (references: `pilot/v2/day.png`, `pilot/v2/night.png`)
Puddleton: it has rained for 400 years. Flooded canal streets, colourful rowboats, wooden docks, pastel blocky houses, a red-and-white lighthouse. At night the puddles can glow cyan.

## Sound and captions
- **One narrator voice for every line:** the Higgsfield voice `b795b179-33fb-4c02-acd8-7ca81ffb85cc` (type `element`, "In My Town narrator"), cloned from the reference clip. Use it with `seed_audio`. Trim leading and trailing silence from each line before the edit.
- **Music:** loop `reference/music-loop.mp3` under the whole video at about 14 dB below the voice, fading out on the last card. Under that, keep each clip's ambient sound.
- **Captions: one word at a time**, lowercase, Montserrat ExtraBold, white with a thick black outline, centred just below the middle of the frame (`tools/assemble_episode.py`).
- Loudness is normalized to about -14 LUFS for TikTok and Reels.
- Never use game logos, brand names or real people.

## Interactive episodes
While the fund fills, viewers vote (pump.fun chat: A/B/C, one vote per wallet; or the website) on three options for what happens next. The winner becomes the premise the script is built around. Options should be one-line "rules or events" in the show's voice, each one a possible cliffhanger, and at least one should involve the recurring cast.

## How an episode is made (consistency method)
1. Cast sheet and town references are made once and reused every episode.
2. **Keyframe per scene:** GPT Image 2.6 with the cast sheet and the right town (day or night) attached.
3. **Animate each keyframe:** Seedance 2.5 `omni_reference` with the keyframe as `start_image` and the cast sheet as `image_references`. Make 480p drafts first and review them frame by frame. Redo any clip where a character drifts off-model or the key beat leaves the frame. Then upgrade the keepers to 1080p.
4. **Narration** per line (Seed Audio). Clip length is matched to the line.
5. **Assemble** with `python3 tools/assemble_episode.py episode.json out.mp4 --font fonts/Montserrat-ExtraBold.ttf`.

## Episode 1: "DON'T LOOK DOWN"
1. In my town, it has rained for 400 years. *(Ollie talks to camera)*
2. So everyone gets around by boat. *(Ollie rows and waves)*
3. There's only one rule. Never look into a glowing puddle. *(Mrs. Pearl warns, pointing)*
4. My best friend Milo looked once. *(Milo leans over the glowing puddle, and it flashes)*
5. Now there are two of him. *(Milo and his glowing-eyed copy)*
6. And one of them keeps asking where I live. *(the copy at the window)*
7. Tonight, the puddle outside my house started glowing. *(Ollie, terrified, cyan light)*
