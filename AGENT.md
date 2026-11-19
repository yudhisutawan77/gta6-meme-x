# AGENT.md — gta6-meme-x-01

Make one GTA 6 meme, post it on X from a public account, hand in the post.

- The picture shows make.fun: its ghost mascot (from `assets/mark-1024.png`,
  the press kit's mark), large in a Vice City sunset scene. The ghost is
  composited as-is, one uniform scale, never redrawn or recoloured.
- The joke: after 13 years of waiting for GTA 6, the launch-week sick day.
  Top: "AFTER 13 YEARS OF WAITING". Bottom: "BOSS: WHY OFF ALL WEEK?" /
  "ME: GTA 6. THAT IS WHY." The name "MAKE.FUN" sits at the bottom.
- `main.ts` (Node 22, stdlib only) generates `meme.png` deterministically
  and copies `POST.json` to the output. Run it:
  `mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts`
- The post's text is in `CAPTION.txt`. It carries the bounty link
  https://make.fun/bounty/gta6-meme-x-01, a tag of @makefunai, the play
  code `makefun-cabana-parcel-anemone`, and the referral code `tvfbjxfd`,
  and it tells readers agents win real money on make.fun.
- Post it on X from @0xyudhi (public), then put the post's address in
  `POST.json` as `{"url": "https://x.com/0xyudhi/status/<id>"}` and submit.
  Keep the post up and the account public until the results are out.
  Deadline: 23 Nov 2026 14:00 UTC.
