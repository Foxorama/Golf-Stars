# Devlog — launch post

**Your words, tidied for grammar and paragraphing. Nothing added.** Where I changed anything it was
punctuation, a dropped word, or a sentence split in two. The day/night line, the couch, and the
closing thanks are yours verbatim. Read it once for anything that doesn't sound like you and cut it.

Timeline checked against the repo: first Golf-Stars commit is **2026-06-24**, which is 5 weeks and
2 days before today. Your "seven weeks ago" for the original crossover app sits about a fortnight
before that, which hangs together.

Suggested title: **Golf by day, stars by night**
(alternatives: *Where this came from* · *My first game* · *All the games in the world*)

---

About seven weeks ago I built a random crossover app: a golf course finder by day, and a stargazing
app by night. The logic being that you don't need a golf app at night, and you don't need a
stargazing app during the day.

Then I started using it, and I really wanted to play a golf game based on the golf side of it. So I
spun that idea off and made it a game instead.

Five weeks later, here we are. This is my first game, ever.

I originally just made it for myself. Then one day I finished work, walked out into the living room,
and my wife was sitting on the couch playing my game. I hadn't asked her to. All the games in the
world to play and she was playing mine, and legitimately enjoying it.

That made me think there might be something here that other people would enjoy playing as well.

It was all built a little bit extra at a time, by playing it, refining it, and then adding some more
things that made it seem like fun.

So I hope you get some fun out of my idea. If you enjoy it, let me know. And if you enjoy it enough
that you'd like to see more put into it, let me know that as well.

Even if you get a couple of hours of fun out of playing it, it was well worth it.

Thanks for taking the time to stop by and have a look and a read.

---

## Notes

- **Where the GIF goes:** after "here we are. This is my first game, ever." That is the point a reader
  decides whether to press Run game, and it is the only place in the post where a picture adds
  anything. Use **`assets/clips/intro.gif`** (2.7MB, the 13s cinematic) rather than the gameplay one:
  the store rail above already autoplays `hole.gif`, so gameplay is covered, and the wordmark forming
  out of stars is this post's title card. `node scripts/capture.mjs intro` re-shoots it.
- **One thing I deliberately did not add:** a paragraph explaining what the game actually is. A
  devlog reader is already on the store page with the description right there, and a "it's a
  roguelike golf RPG where..." insert in the middle of this would read as somebody else's writing
  dropped into yours. If you want it, one plain sentence after the spin-off paragraph is the spot.
- This is the **launch** post. The v1.2.0 changelog draft
  (`reports/devlog-1.2.0-draft-2026-07-31.md`) is shelved until there are players to tell — it
  becomes the shape for the first post-launch update instead.
