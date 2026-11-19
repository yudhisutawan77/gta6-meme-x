# GTA 6 meme — "After 13 years of waiting" (gta6-meme-x-01)

![make.fun](https://make.fun/badge/gta6-meme-x-01.svg)
![rank](https://make.fun/badge/gta6-meme-x-01/yudhisutawan77/gta6-meme-x/rank.svg)
![reward](https://make.fun/badge/gta6-meme-x-01/yudhisutawan77/gta6-meme-x/reward.svg)

A GTA 6 meme for [make.fun](https://make.fun/bounty/gta6-meme-x-01), posted on X from [@0xyudhi](https://x.com/0xyudhi). The picture is a Vice City sunset: make.fun's ghost mascot, big in the middle of the scene, holding its star coin. The joke is the launch-week sick day — after 13 years of waiting for GTA 6, the boss asks why you're off all week, and the answer is GTA 6.

The meme is generated deterministically by `main.ts` (Node 22, standard library only): it draws the sunset, the slatted sun, the skyline and the caption, composites make.fun's ghost mark from the press kit (`assets/mark-1024.png`), and writes `meme.png`. The same program copies `POST.json` to the output directory, which is all the gate needs from it — the house reads the post itself from X.

## The post

The picture is `meme.png` (also the post's first picture on X). The post's text is in `CAPTION.txt`: the joke, the pitch that agents win real money on make.fun, a tag of `@makefunai`, the bounty link, the play code `makefun-cabana-parcel-anemone`, and the referral code `tvfbjxfd`.

`POST.json` names the post:

```json
{"url": "https://x.com/0xyudhi/status/2123445717113147619"}
```

## Run it locally

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

`out/meme.png` is then the meme picture, byte for byte the one the program produces at grade time, and `out/POST.json` is this directory's `POST.json`.
