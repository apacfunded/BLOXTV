# Launchpad ad: Roblox Studio shoot pack

Everything needed to record the ad's footage in Roblox Studio. Record the 7 shots below as separate clips, drop them in `ads/footage/`, and I turn them into the finished ad (voice, one-word captions, music, split screen, title card, loudness).

Time needed: about an afternoon for someone who has used Studio before. Cost: free. Studio is free at create.roblox.com.

---

## 1. Project setup

- New place, **Baseplate** template. Delete the baseplate's spawn location after building.
- **Lighting:** Lighting > Technology = `Future`. Add `Atmosphere`, `Bloom` (intensity 0.4), `ColorCorrection` (saturation +0.15, contrast +0.05). This gives the bright, slightly glossy look of the reference shorts.
- **Avatars:** make the four characters as real avatars (R15 rig) using the `Rig Builder` plugin (Avatar tab > Rig Builder > R15 > Block Rig), then dress them (section 2). Keep them as models named `Ollie`, `Dune`, `Frost`, `Ember`.
- **Faces:** use a 2D face decal on the head, the big-eyes anime style the trend uses. Make 3 versions of each kid's face decal: `neutral`, `talking` (mouth open), `shocked`. You swap them between shots.
- **Camera:** record through the Studio camera, FOV 70 for wide town shots, FOV 40 for close-ups (Workspace > Camera > FieldOfView).
- **Record:** 1080x1920 vertical. Easiest: set the viewport to a vertical size (drag the 3D view narrow, or use the `Device emulation` with a phone preset in portrait), then record the screen with OBS at 1080x1920, 30 fps. Hide all Studio UI (View > uncheck everything, press F11 for fullscreen).
- **Animations:** play standard animations on the rig with the `Animation Editor`, or simply run the place (Play) and use the built-in idle, walk and emotes (`/e wave`, `/e point`, `/e dance`). Playing the place and moving the avatar is faster for most shots.

## 2. The four kids (R15 block rigs)

| Kid | Skin | Hair mesh | Head accessory | Shirt | Pants | Shoes/extra |
|---|---|---|---|---|---|---|
| **Ollie** | warm beige | short messy brown | yellow bucket hat | glossy yellow raincoat with 3 dark buttons (shirt template) | navy | navy rubber boots painted on pants |
| **Dune** | tan | spiky black | goggles on forehead, red bandana on neck | sand vest over white tee | brown cargo shorts | sandals |
| **Frost** | pale, pink cheeks on decal | light blond under a white pom-pom beanie | beanie | sky-blue puffer coat | grey | brown snow boots |
| **Ember** | dark brown | short curly dark | none | orange hoodie, hood down, white strings | black shorts | red high-top sneakers |

Use the catalog or upload simple shirt/pants templates. Keep colours flat and saturated. Reference picture: `ads/reference-sheet.png` (top row).

## 3. The four towns (one small set each, 30 x 30 studs is enough)

Build only what the camera sees behind the narrator: one street, 4–6 houses, the signature detail.

| Town | Build | Signature detail | Sky/light |
|---|---|---|---|
| **Puddleton** | canal street: a flat blue `Water` terrain strip with wooden plank docks each side, pastel houses (mint, pink, sky blue, yellow) | 3 rowboats (red, yellow, blue) moored, a red-white lighthouse on a hill behind | daylight, overcast, `Rain` particle emitter over the set |
| **Dustmoor** | sandy ground, flat-roof sandstone cube houses with red awnings, a water tower | green cacti, big orange sun low in the sky | golden hour: ClockTime 17.5, orange ambient |
| **Hollowfrost** | snow terrain, log cabins with snow slabs on the roofs, warm yellow windows | 3 identical snowmen in a row with red scarves, frozen pond in front | dusk: ClockTime 18.5, blue-violet, snow particle emitter |
| **Cindervale** | dark grey stone houses with orange `Neon` windows, a volcano cone behind | a `Neon` orange lava strip down the middle of the street, red flame banners, ember particles | night: ClockTime 0, orange point lights along the lava |

## 4. Shot list (record each as its own clip, 1080x1920, 30 fps)

Record about 2 seconds longer than listed; I trim. Narration is added later, so the kids just need to look like they're talking: swap to the `talking` face and run a small head bob with the Animation Editor, or alternate `neutral` and `talking` every half second by swapping the decal while recording.

| # | File | Length | Kid / town | Camera | Action |
|---|---|---|---|---|---|
| 1 | `01_ollie_hook.mp4` | 6 s | Ollie, Puddleton dock | FOV 40, chest-up, centred, very slow push-in | idle sway, talking face, small shrug at the end (`/e shrug` if available, otherwise none) |
| 2 | `02_ollie_fee.mp4` | 6 s | Ollie, same spot | FOV 40, chest-up, locked | talking face, `/e point` upward once, then nod |
| 3 | `03_dune_desert.mp4` | 6 s | Dune, Dustmoor street | FOV 40, chest-up, slow push-in | talking face; behind him move a thin sand part sideways with a `TweenService` script or just slide it by hand with the Move tool while recording (3 studs over 4 s) |
| 4 | `04_frost_snow.mp4` | 6 s | Frost, Hollowfrost by the pond, 3 snowmen behind | FOV 40, chest-up, locked | talking face, then at 3 s rotate all three snowman heads 90° to face the camera (group them, rotate once with the Rotate tool) and swap Frost to `shocked` |
| 5 | `05_ember_volcano.mp4` | 6 s | Ember, Cindervale lava bank | FOV 40, chest-up, slow push-in | talking face; at 3 s raise a small orange Neon sphere out of the lava and tween it up and down once (the "wave") |
| 6 | split screen | — | — | — | nothing to record; I build it from clips 1, 3, 4, 5 |
| 7 | `07_ollie_cta.mp4` | 6 s | Ollie, Puddleton dock | FOV 60, head-to-knees medium shot, locked | idle, one nod, then `/e wave` |

Also record, for safety: `b_puddleton.mp4`, `b_dustmoor.mp4`, `b_hollowfrost.mp4`, `b_cindervale.mp4`: 5 s of each town with no character, slow pan. I use these for cutaways if any clip has a glitch.

## 5. Recording checklist

- Hide all UI, fullscreen, 1080x1920, 30 fps, OBS at 20 Mbps or higher.
- Keep the narrator centred with their head just below the top third; captions go in the middle.
- No chat window, no cursor, no selection boxes (deselect everything before recording).
- Don't put any text, logos or the Roblox name anywhere in the scene.
- Name the files exactly as in the table and put them in `ads/footage/`.

## 6. What happens next (my side)

1. I trim each clip to its line, generate the 7 narration lines (ElevenLabs, under 1 credit), and match the kids' talking to the words.
2. Captions one word at a time, the fund bar over clip 2, the 2x2 split screen for scene 6, the title card at the end, music under everything, loudness for Twitter/TikTok.
3. You get `ads/launchpad-ad.mp4`, 1080x1920, ready to post.

Total Higgsfield cost for the ad this way: under 2 credits.
