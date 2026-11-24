#!/usr/bin/env python3
"""Assemble the launchpad ad: 5 narrator clips + narration -> 1080x1920 ad with one-word captions,
a filling "next episode" fund bar on scene 2, a 2x2 split screen under the final line, and a title card.

Usage: python3 tools/assemble_ad.py ad.json out.mp4 --font Montserrat-ExtraBold.ttf
ad.json: {"scenes":[{"clip","vo","line"}...], "split": [clip indexes for the 2x2], "cta": {"line","vo"},
          "title":"IN MY TOWN", "subtitle":"live on pump.fun", "url":"inmytown.fun"}
"""
import json, os, subprocess, sys, tempfile

W, H, FPS = 1080, 1920, 30
PAD_BEFORE, PAD_AFTER = 0.15, 0.35
FUND_SCENE = 1  # 0-based index of the scene that gets the fund bar


def probe(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                                capture_output=True, text=True, check=True).stdout.strip())


def ass_time(t):
    h, rem = divmod(t, 3600); m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def main():
    args = sys.argv[1:]
    font = None
    if "--font" in args:
        i = args.index("--font"); font = os.path.abspath(args[i + 1]); del args[i:i + 2]
    spec_path, out = args
    base = os.path.dirname(os.path.abspath(spec_path))
    spec = json.load(open(spec_path))
    tmp = tempfile.mkdtemp(prefix="ad_")
    parts, events, t0 = [], [], 0.0

    def caption_events(line, start, vo_d):
        words = line.split()
        weights = [len(w.strip(".,!?")) + 2 for w in words]
        total, t = sum(weights), start + PAD_BEFORE
        for w, wt in zip(words, weights):
            d = vo_d * wt / total
            events.append((t, t + d, w.strip(".,!?;:\"'").lower()))
            t += d

    def scene_part(n, vfilter, inputs, vo, dur, extra_amb=None):
        """Render one scene: video filter chain -> [v], ambience + narration -> [a]."""
        part = os.path.join(tmp, f"p{n}.mp4")
        amb = extra_amb or "[0:a]volume=0.35"
        run([*inputs, "-i", vo, "-filter_complex",
             f"{vfilter},tpad=stop_mode=clone:stop_duration={dur},trim=duration={dur},setpts=PTS-STARTPTS[v];"
             f"{amb},apad,atrim=duration={dur}[amb];"
             f"[{len(inputs)//2}:a]adelay={int(PAD_BEFORE*1000)}|{int(PAD_BEFORE*1000)},volume=1.6,apad,atrim=duration={dur}[vo];"
             f"[amb][vo]amix=inputs=2:normalize=0,aresample=44100[a]",
             "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2", part])
        parts.append(part)

    fit = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}"

    # --- Narrator scenes
    for n, s in enumerate(spec["scenes"]):
        clip, vo = os.path.join(base, s["clip"]), os.path.join(base, s["vo"])
        vo_d = probe(vo)
        dur = max(vo_d + PAD_BEFORE + PAD_AFTER, 2.5)
        vf = f"[0:v]{fit}"
        if n == FUND_SCENE:
            # Fund bar: rounded track + fill that grows from 20% to 100% over the line, label above.
            bx, by, bw, bh = 120, 300, W - 240, 44
            vf += (f",drawbox=x={bx}:y={by}:w={bw}:h={bh}:color=white@0.35:t=fill"
                   f",drawbox=x={bx}:y={by}:w='{bw}*min(1\\,0.2+0.8*t/{vo_d:.2f})':h={bh}:color=0x2563eb@1:t=fill"
                   f",drawbox=x={bx}:y={by}:w={bw}:h={bh}:color=white@0.9:t=4")
            if font:
                vf += (f",drawtext=fontfile='{font}':text='next episode':fontsize=44:fontcolor=white:borderw=6:bordercolor=black"
                       f":x=(w-text_w)/2:y={by-70}")
        scene_part(n, vf, ["-i", clip], vo, dur)
        caption_events(s["line"], t0, vo_d)
        t0 += dur

    # --- Final line over a 2x2 split of four clips
    cta = spec["cta"]
    vo = os.path.join(base, cta["vo"]); vo_d = probe(vo)
    dur = vo_d + PAD_BEFORE + PAD_AFTER
    clips = [os.path.join(base, spec["scenes"][i]["clip"]) for i in spec["split"]]
    inputs = []
    for c in clips: inputs += ["-i", c]
    tw, th = W // 2, H // 2
    tile = lambda k: f"[{k}:v]scale={tw}:{th}:force_original_aspect_ratio=increase,crop={tw}:{th},fps={FPS},setpts=PTS-STARTPTS[t{k}]"
    vf = ";".join(tile(k) for k in range(4)) + ";" + \
        f"[t0][t1]hstack[top];[t2][t3]hstack[bot];[top][bot]vstack,drawbox=x={tw-3}:y=0:w=6:h={H}:color=white:t=fill," \
        f"drawbox=x=0:y={th-3}:w={W}:h=6:color=white:t=fill,scale={W}:{H}"
    amb = "[0:a][1:a][2:a][3:a]amix=inputs=4:normalize=0,volume=0.25"
    scene_part(len(spec["scenes"]), vf, inputs, vo, dur, extra_amb=amb)
    caption_events(cta["line"], t0, vo_d)
    t0 += dur

    # --- Title card (2.4 s)
    card_d = 2.4
    card = os.path.join(tmp, "card.mp4")
    txt = ""
    if font:
        txt = (f",drawtext=fontfile='{font}':text='{spec.get('title','IN MY TOWN')}':fontsize=150:fontcolor=white:x=(w-text_w)/2:y=(h/2)-200"
               f",drawtext=fontfile='{font}':text='{spec.get('subtitle','')}':fontsize=52:fontcolor=0xc7d2fe:x=(w-text_w)/2:y=(h/2)-20"
               f",drawtext=fontfile='{font}':text='{spec.get('url','')}':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=(h/2)+70")
    run(["-f", "lavfi", "-i", f"color=c=0x0c1626:s={W}x{H}:d={card_d}:r={FPS}", "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo:d={card_d}",
         "-vf", f"format=yuv420p{txt},fade=t=in:st=0:d=0.25,fade=t=out:st={card_d-0.6}:d=0.6",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "160k", "-shortest", card])
    parts.append(card)

    # --- Join, captions, loudness
    lst = os.path.join(tmp, "list.txt")
    open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    joined = os.path.join(tmp, "joined.mp4")
    run(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined])
    ass = os.path.join(tmp, "captions.ass")
    with open(ass, "w") as f:
        f.write(f"[Script Info]\nScriptType: v4.00+\nPlayResX: {W}\nPlayResY: {H}\n\n[V4+ Styles]\n"
                "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
                "Style: Word,Montserrat ExtraBold,124,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,9,4,5,60,60,0,1\n\n"
                "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
        for a, b, w in events:
            f.write(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},Word,,0,0,0,,{{\\pos({W//2},{int(H*0.56)})\\fscx85\\fscy85\\t(0,80,\\fscx100\\fscy100)}}{w}\n")
    fontsdir = os.path.dirname(font) if font else None
    total = t0 + card_d
    music = spec.get("music")
    if music:
        # Loop the music bed under the whole ad, 14 dB under the voice, fade out with the title card.
        music = os.path.join(base, music)
        run(["-i", joined, "-stream_loop", "-1", "-i", music,
             "-filter_complex",
             f"[1:a]volume={spec.get('music_db', -14)}dB,atrim=duration={total:.2f},afade=t=in:st=0:d=0.5,afade=t=out:st={total-1.6:.2f}:d=1.6[m];"
             f"[0:a][m]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]",
             "-map", "0:v", "-map", "[a]", "-vf", f"ass={ass}" + (f":fontsdir={fontsdir}" if fontsdir else ""),
             "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", "-movflags", "+faststart", out])
    else:
        run(["-i", joined, "-vf", f"ass={ass}" + (f":fontsdir={fontsdir}" if fontsdir else ""),
             "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
             "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-movflags", "+faststart", out])
    print(f"wrote {out} ({t0 + card_d:.1f}s, {len(events)} caption words)")


if __name__ == "__main__":
    main()
