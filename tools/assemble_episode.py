#!/usr/bin/env python3
"""Assemble a finished 'In my town' episode from per-scene clips and narration.

Usage: python3 tools/assemble_episode.py episode.json out.mp4 [--font path/to/Montserrat-ExtraBold.ttf]

episode.json:
{ "scenes": [ {"clip": "clip1.mp4", "vo": "vo1.mp3", "line": "In my town, it has rained for 400 years."}, ... ] }

Each scene runs for its narration plus a short beat. A clip shorter than that holds its last frame.
The clip's own ambient audio stays underneath the voice. Captions are burned in one word at a time,
centered: bold white with a black outline, the trend's caption style.
"""
import json, os, subprocess, sys, tempfile

W, H, FPS = 1080, 1920, 30
PAD_BEFORE, PAD_AFTER = 0.15, 0.45


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def ass_time(t):
    h, rem = divmod(t, 3600); m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def main():
    args = sys.argv[1:]
    font = None
    if "--font" in args:
        i = args.index("--font"); font = args[i + 1]; del args[i:i + 2]
    spec, out = args
    base = os.path.dirname(os.path.abspath(spec))
    scenes = json.load(open(spec))["scenes"]
    tmp = tempfile.mkdtemp(prefix="ep_")
    parts, events, t0 = [], [], 0.0

    for n, s in enumerate(scenes):
        clip = os.path.join(base, s["clip"])
        vo = os.path.join(base, s["vo"]) if s.get("vo") else None
        vo_d = probe(vo) if vo else max(2.0, len(s["line"].split()) * 0.38 + 0.8)  # no narration: time captions to the words
        dur = max(vo_d + PAD_BEFORE + PAD_AFTER, 2.5)
        part = os.path.join(tmp, f"p{n}.mp4")
        inputs = ["-i", clip] + (["-i", vo] if vo else [])
        audio = (f"[0:a]volume=0.35,apad,atrim=duration={dur}[amb];"
                 f"[1:a]adelay={int(PAD_BEFORE*1000)}|{int(PAD_BEFORE*1000)},volume=1.6,apad,atrim=duration={dur}[vo];"
                 f"[amb][vo]amix=inputs=2:normalize=0,aresample=44100[a]") if vo else f"[0:a]volume=0.6,apad,atrim=duration={dur},aresample=44100[a]"
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", *inputs,
            "-filter_complex",
            f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},"
            f"tpad=stop_mode=clone:stop_duration={dur},trim=duration={dur},setpts=PTS-STARTPTS[v];" + audio,
            "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", os.environ.get("ASSEMBLE_PRESET", "veryfast"), "-crf", "20",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2", part], check=True)
        parts.append(part)

        # One caption per word, spread over the narration, longer words get a bit more time.
        words = s["line"].split()
        weights = [len(w.strip(".,!?")) + 2 for w in words]
        total, t = sum(weights), t0 + PAD_BEFORE
        for w, wt in zip(words, weights):
            d = vo_d * wt / total
            events.append((t, t + d, w.strip(".,!?;:\"'").lower()))
            t += d
        t0 += dur

    # Concatenate scenes
    lst = os.path.join(tmp, "list.txt")
    open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    joined = os.path.join(tmp, "joined.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined], check=True)

    # Captions as ASS: Montserrat ExtraBold, white, thick black outline, centered (alignment 5).
    ass = os.path.join(tmp, "captions.ass")
    with open(ass, "w") as f:
        f.write(f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,Montserrat ExtraBold,124,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,9,4,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""")
        for a, b, w in events:
            f.write(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},Word,,0,0,0,,{{\\pos({W//2},{int(H*0.56)})\\fscx85\\fscy85\\t(0,80,\\fscx100\\fscy100)}}{w}\n")

    fontsdir = os.path.dirname(os.path.abspath(font)) if font else None
    vf = f"ass={ass}" + (f":fontsdir={fontsdir}" if fontsdir else "")
    spec_all = json.load(open(spec))
    music = spec_all.get("music")
    if music and not os.path.isabs(music): music = os.path.join(base, music)
    if music and os.path.exists(music):
        # Loop the show's music bed under everything, quiet, fading out at the end.
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", joined, "-stream_loop", "-1", "-i", music, "-filter_complex",
                        f"[1:a]volume={spec_all.get('music_db', -14)}dB,atrim=duration={t0:.2f},afade=t=in:st=0:d=0.5,afade=t=out:st={max(0, t0-1.5):.2f}:d=1.5[m];"
                        f"[0:a][m]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]",
                        "-map", "0:v", "-map", "[a]", "-vf", vf, "-c:v", "libx264", "-preset", os.environ.get("ASSEMBLE_PRESET", "veryfast"), "-crf", "20", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", "-movflags", "+faststart", out], check=True)
    else:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", joined, "-vf", vf, "-c:v", "libx264", "-preset", os.environ.get("ASSEMBLE_PRESET", "veryfast"),
                        "-crf", "20", "-pix_fmt", "yuv420p", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k",
                        "-ar", "44100", "-movflags", "+faststart", out], check=True)
    print(f"wrote {out} ({t0:.1f}s, {len(events)} caption words)")


if __name__ == "__main__":
    main()
