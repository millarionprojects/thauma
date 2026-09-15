# Thauma preview — implementation notes

This folder is the isolated review build. The production root remains unchanged.

## Implemented in this review build

- Automatic redirect to the newly created gift after submit.
- Uploaded images are shown with contain/fit behavior instead of hard crop.
- PDF preview renders page 1 as the main certificate view; the original file remains downloadable.
- Seamless visual handoff from the opening scene into the full certificate view.
- Longer video-export tail so the opening reaches and holds its final state.
- Envelope timing tightened to remove the long dead pause between flap opening and certificate lift.
- Classic and For Him: ribbon/bow release is staged before lid motion; certificate lift is made vertical-first before forward tilt.
- Jewelry Box: certificate stays upright longer and clears the opening before forward tilt.
- Future Case: certificate lifts through the opening before moving forward/tilting.
- Balloon: unexplained card scale jump is reduced; shell pulse is restrained.
- Scroll: sheet edges use a curled roll approximation tied to roller rotation instead of only clipping/stretching the sheet.
- Material polish for reflective/clearcoat surfaces and slightly closer framing for small scenes.
- Reduced-motion preference disables the extra certificate handoff animation.

## Live acceptance pass still required

Run on iPhone Safari with real WebGL/GPU and check every design in light/dark where applicable:

1. No certificate/body intersection at any frame.
2. Ribbon/bow visually releases before lid travel.
3. Certificate handoff feels continuous, not like a separate screen.
4. Full uploaded image is visible without forced crop.
5. PDF first page is fully visible and the original PDF downloads correctly.
6. Replay returns every scene to a clean initial state.
7. Video export includes the complete opening and final hold, with and without audio.
8. Portrait/landscape, focus loss/return and reduced-motion behavior remain stable.
