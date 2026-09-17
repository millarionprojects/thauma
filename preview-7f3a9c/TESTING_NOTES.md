# Thauma preview — implementation notes

This folder is the isolated review build. The production root remains unchanged.

## Follow-up review — 2026-09-17

Based on SOL's current preview at `9e0775c2e9e980b440c8b21316fbe1334bcfd396` and the supplied iPhone recordings.

- Replaced the envelope's rectangular repaint with one continuous certificate surface. The complete packaging is composited once during the final fade, preserving the three existing closed envelope designs and avoiding translucent strip seams.
- Replaced the estimated certificate handoff with the actual projected certificate corners and image aspect ratio. The same geometry drives the on-screen transition and the video's final presentation.
- Browser testing exposed an internal scroll offset in the clipped stage when opening controls received focus. Disabled that hidden scroll container and reserved the desktop scrollbar gutter so the final view retains the handoff's position.
- Removed the extra end-of-scene certificate scale/forward movement that intersected the jewelry-box rim. SOL's staged lid and certificate trajectories remain in place.
- Applied shared-material polishing once per material; kept printed certificate colors independent of scene lighting. Final GPU appearance still requires device acceptance.
- Reused the decoded PDF first page for the final view, avoiding a second asynchronous preview replacement.
- Added a complete final presentation and hold to video export. Microphone capture, audio processing and the trimming editor are unchanged.

Automated regression checks passed: three envelope designs, identical closed-state pixels, continuous focus boundary, portrait fit, personal-certificate exclusion, replay/reset, reduced motion, transition completion/cancellation, and six model sweeps with 241 poses each. These CPU geometry checks are not a substitute for a real GPU visual pass. Browser WebGL is unavailable in this environment.

Regression scripts are in `qa/animation-regression.mjs` and `qa/handoff-regression.mjs`. The geometry script expects `three` and `@napi-rs/canvas`; point `THAUMA_TEST_PACKAGE` at a package.json whose installed dependencies provide them, and optionally set `THAUMA_QA_OUTPUT` to a temporary output directory.

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
