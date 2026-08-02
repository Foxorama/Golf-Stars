# Devlog draft — a day on one bounce

**Written by Claude in your voice, from the day's actual record — not your words tidied.** So read it
harder than the launch post. Every number is checked against the repo and named below; the judgement
calls about what counts as "wrong" are mine and are the first thing to argue with.

Facts used: 812 commits since 2026-06-24. Ten pull requests merged on 2026-08-02, seven of them about
the ball's bounce. Titles and numbers from `git log --first-parent`.

Suggested title: **A day on one bounce**
(alternatives: *Eight tries at a bouncing ball* · *What the loop actually looks like* · *The day I
watched it get worse*)

---

I spent a whole day trying to make the golf ball bounce properly when it lands. I want to write down
what that actually looked like, because I think it's more useful than a summary would be.

Short version: it took ten pull requests, two of them made the game worse, and the thing that finally
fixed it was a wedge in my bag.

## How this is built

The AI writes all of the code. I do the design, the play-testing, and the deciding. That's been the
arrangement for 812 commits and about five and a half weeks. I'm not making a point with that, it's
just what it is.

What that means in practice is a loop: I play it, I say what's wrong, it changes something, I play it
again. Most of the time that works. This is the story of a day where it didn't, and I think the
failure is more interesting than the successes.

## The ask

The bounce was fine. I just wanted a bit more of it — a driver skipping four to six times instead of
two or three, and a ladder down through the bag to the wedges. I gave numbers for each club.

That was the whole request.

## What happened

Seven attempts, in order:

1. **The camera zooms in when the ball lands.** The AI measured that a driver's whole run-out was
   being drawn into 61 screen pixels. Real problem, and the fix was reported as done.
2. **Per-club bounce counts.** Driver five, wood four, hybrid three, and so on down. Fine.
3. **The camera stops chasing the ball.** This one actually mattered, and I'll come back to it.
4. **The camera arrives before the ball does.** Fixed a real thing. Introduced a worse one.
5. **Rip the zoom out.** I'd asked for that. Turned out it was making it harder to watch, not easier.
6. **The actual fix.** One number.
7. **A wedge in my bag was the reason my own save never bounced at all.**

Two of those made the game worse than before I asked. Both went live within minutes of merging,
because at that point every merge deployed straight to the version people have installed on their
phones. More on that at the end.

## The thing that kept going wrong

After each attempt I'd get a report saying it was fixed, with numbers. The numbers were real. The
bounce still wasn't there.

Every one of those measurements was of the *model* — how high the hop was in course yards, how many
hops were planned — and none of them were of the *picture*. There's a preview script in the repo that
draws a landing so you can look at it, and the AI eventually worked out that it had been drawing every
bounce at 4.6 pixels per yard while the game drew a driver's at 1.6. So every "the bounce reads now"
verdict for weeks, its and mine, had been read off a camera the game doesn't use.

It got fixed when the AI stopped measuring its own model and hooked the game's actual drawing calls
instead — recording where the ball and its shadow were painted, frame by frame, in a real browser.
That found two things in one run: the ball wasn't moving forward on screen at all during the run-out
(the camera was tracking it, so the world scrolled and the ball sat still), and the bounces were being
played at 100 milliseconds instead of the 130 they were planned at.

Which is the honest lesson from the day, and it's the AI's to learn more than mine: measuring the
thing you built is not the same as measuring what the player sees, and it will report green all day.

## The two that made it worse

Worth being specific, because "AI ships regressions" is easy to say and vague.

The first was the zoom. It was reasoned from a true measurement and it fixed a real problem — the
landing genuinely was too small to see. But a camera moving through the moment you're trying to watch
is a camera your eye has to re-find the ball against, and three rounds of measurement all said "the
bounce is bigger now" while none of them could see it had become harder to watch. I asked for it to be
removed and it was.

The second was mine to catch too. Fixing one camera problem introduced another, and what I saw was
the ball travelling through the air and then suddenly speeding up right at the end. That turned out
to be an exact description of the bug — when the AI went looking, the camera's target was being
snapped forward 84 yards in a single frame, which flung the ball backwards across the screen at 25
pixels a frame and then dropped it into a run-out crawling at one.

## What actually fixed it

I told it which clubs didn't bounce: drivers, woods, hybrids, long irons. Short irons and wedges were
fine.

That split turned out to be exact, which the AI established by measuring every club against it. A hop
is drawn with a height and a length, and the ratio between them comes from how steeply the club lands.
Every club I'd named drew a hop *flatter than it was long*. Every club I said was fine drew one
*taller than it was long*. The line sat at 1.0, and I'd apparently found it to the club without
knowing the number existed.

The floor that's supposed to stop a hop being too flat was set at 0.12, less than half of where a hop
starts reading as a bounce. Moved to 0.30. That was the fix.

The awkward part came out of the same dig. There was a test asserting the bounce stay *below* that
threshold, written earlier on the assumption that a tall hop looks like the ball popping vertically
off the turf, and never checked against anything. The sand wedge had been drawing at 1.38 for weeks
and was one of the clubs I'd just said looked right. So a guard built on a guess had been blocking the
fix for three attempts, and every one of those attempts was free to try raising it and didn't, because
the test would have gone red.

## And then my own save still didn't bounce

Even after all that, my game didn't bounce. A new game did. The same golfer in other modes did.

I sent my save file over, and the AI replayed it. The campaign had a **Milled Tour Wedge** equipped —
a wedge-slot item whose description says it "rips a touch more backspin so approaches check up". It
was subtracting that backspin from *every club in the bag*. My driver had lost 43% of its roll, my
3-hybrid was down to about three yards, and my 7-iron and 8-iron had none at all.

No roll means no bounce. The ball lands and stops.

So the whole day's hunt was chasing a rendering problem that was partly real, while the thing making
my particular game look broken was an item description that didn't match what the item did.

There's a decent postscript. That bug used to be bigger — enough backspin and even the driver would
check — and I actually liked it. On the island worlds, where run just carries you off the edge, a ball
that stops dead is worth more than a ball that goes far. So it's fixed as a default and kept behind a
flag, to build properly later as a thing you choose.

## What I changed about how this works

Every merge was going straight to the installed app. That's how two bad passes reached my phone the
same minute they were merged.

So now `main` deploys to a staging site, every pull request gets its own link I can open on my phone
before it's merged, and the live game only updates when I tag a release. That's this release.

I'd always planned to do this and I should have done it before the game went public. What forced my
hand was that I'd sat down expecting to make a couple of quick changes to the bounce, and it turned
out to be nothing of the sort. That's happened a few times now and it still catches me by surprise
every time — the small jobs are the ones that eat the day, and the ones I brace for tend to go fine.
Getting shoved into building the thing I'd been putting off is a decent trade for the day, honestly.

There was also a genuinely annoying stretch where my phone wouldn't update at all and I had no way to
tell what build it was on, because the version number on the title screen hadn't changed in fourteen
merges. It now shows the commit next to the version, so I can look at two phones and know.

## What I make of it

The loop works. It just doesn't work the way the summaries make it sound. It took ten attempts, two of
which went backwards, and the two things that broke the deadlock were both mine: noticing that four
specific clubs were wrong, and remembering that it used to be better.

The AI was better than me at everything downstream of that — measuring, finding the mechanism, writing
the thing down so it doesn't recur. It was consistently, confidently wrong about whether the job was
done.

I don't think that's a complaint. It's just what the work is.
