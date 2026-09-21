import { createGiftScene } from "./envelope-scenes-continuous.js";
import { mountAudioExport, prepareSoundtrack, recordingLength } from "./export-audio.js";
import { _ as z, t as o, s as G, b as W, l as q, r as ie, g as oe } from "./copy-review.js";
import { G as ee, D as Y, d as re, a as $ } from "./scene-engine-DthTCrw0.js";
import { beginCertificateTransition, drawExportPresentation, PRESENTATION_SECONDS } from './certificate-presentation.js';
import { verifyVideo, waitForMedia } from './export-integrity.js?v=20260922-timeline2';
import { normalizeMp4Timeline } from './mp4-integrity.js?v=20260922-timeline2';
import { createExportPainter } from './export-render.js?v=20260921-video2';
import { shareVideoFile, saveMessage } from './export-save.js?v=20260921-save3';
async function de(t) {
  if (!(t != null && t.blob)) return null;
  if (t.type === "application/pdf") {
    const { getDocument: n, GlobalWorkerOptions: d } = await z(async () => {
      const { getDocument: u, GlobalWorkerOptions: r } = await import("./pdf-DCt7qnim.js");
      return { getDocument: u, GlobalWorkerOptions: r };
    }, [], import.meta.url), { default: l } = await z(async () => {
      const { default: u } = await import("./pdf.worker.min-B8x2eVDF.js");
      return { default: u };
    }, [], import.meta.url);
    d.workerSrc = l;
    const c = n({ data: new Uint8Array(await t.blob.arrayBuffer()), isEvalSupported: false });
    c.onPassword = () => c.destroy();
    try {
      const u = await c.promise, r = await u.getPage(1), f = r.getViewport({ scale: 1 }), E = r.getViewport({ scale: Math.min(2, 1600 / Math.max(f.width, f.height)) }), w = document.createElement("canvas");
      return w.width = Math.ceil(E.width), w.height = Math.ceil(E.height), await r.render({ canvasContext: w.getContext("2d"), viewport: E }).promise, w;
    } finally {
      await c.destroy();
    }
  }
  const i = URL.createObjectURL(t.blob);
  try {
    const n = new Image();
    n.src = i, await n.decode();
    const d = document.createElement("canvas"), l = Math.min(1, 1600 / Math.max(n.naturalWidth, n.naturalHeight));
    return d.width = Math.max(1, Math.round(n.naturalWidth * l)), d.height = Math.max(1, Math.round(n.naturalHeight * l)), d.getContext("2d").drawImage(n, 0, 0, d.width, d.height), d;
  } finally {
    URL.revokeObjectURL(i);
  }
}
function se(t, i = false) {
  return i ? { ...t } : { design: t.design, theme: t.theme, lang: t.lang, title: t.lang === "en" ? "A gift for you" : "\u041F\u043E\u0434\u0430\u0440\u043E\u043A \u0434\u043B\u044F \u0432\u0430\u0441", amount: "", message: t.lang === "en" ? "A moment to remember." : "\u041C\u043E\u043C\u0435\u043D\u0442, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C." };
}
const e = (t) => document.getElementById(t), b = new URLSearchParams(location.search), g = e("giftStage"), h = e("openingScene"), C = e("revealScene"), le = e("sceneCanvas"), F = matchMedia("(prefers-reduced-motion: reduce)");
let a = null, s = null, k = "loading", V = null, J = null, L = null, y = null, T = false, x = null, K = null, _ = null;
let certificateTransition = null;
function m(t) {
  e("revealStatus").textContent = t;
}
function v(t) {
  k = t, g.dataset.state = t, e("openingTitle").setAttribute("aria-hidden", String(t !== "idle" && t !== "loading"));
}
function ce() {
  const t = { openingEyebrow: "forYou", openButton: "open", sceneLoading: "loading", yourGiftLabel: "yourGift", downloadCertificate: "certificate", downloadVideo: "video", saveVideo: "saveVideo", replayButton: "replay", privacyHint: "privacyHint", saveHelp: "saveHint" };
  for (const [i, n] of Object.entries(t)) e(i).textContent = o(n);
  e('downloadVideoFile').textContent=q==='en'?'Download video':'Скачать видео';
  e("openingTitle").innerHTML = o("tap"), e("closeButton").setAttribute("aria-label", o("close")), e("giftButton").setAttribute("aria-label", o("openGift")), document.querySelectorAll("[data-i18n]").forEach((i) => {
    i.textContent = o(i.dataset.i18n);
  });
}
async function ue() {
  try {
    if (b.has("lang") && W(b.get("lang"), false), a = b.has("demo") ? { title: o("defaultTitle"), amount: "", message: o("defaultMessage"), design: $.includes(b.get("design")) ? b.get("design") : "envelope-gold", lang: q, theme: b.get("theme") || ie("magix-theme", "light"), file: null } : await oe(b.get("id")), !a) {
      Q();
      return;
    }
    $.includes(a.design) || (a.design = "classic"), a.lang && W(a.lang, false), a.lang = q, a.theme = a.theme === "dark" ? "dark" : "light", document.documentElement.dataset.theme = a.theme, ce(), g.dataset.design = a.design, e("sceneName").hidden = true, e("giftMessage").textContent = a.message || o("defaultMessage"), document.title = q === "en" ? "Thauma \u2014 a gift for you" : "Thauma \u2014 \u043F\u043E\u0434\u0430\u0440\u043E\u043A \u0434\u043B\u044F \u0432\u0430\u0441", fe(), pe();
    try {
      a.certificateImage = await de(a.file);
      if (a.file?.type === 'application/pdf' && a.certificateImage) {
        a.certificateImage.dataset.pdfFirstPage = '1';
        a.certificateImage.setAttribute('aria-label', a.title || o('defaultTitle'));
        e('certificatePreview').replaceChildren(a.certificateImage);
      }
    } catch {
      m(o("pdfHint"));
    }
    try {
      s = await createGiftScene(le, { design: a.design, theme: a.theme, gift: a }, ee), s.onError = X;
      const t = () => {
        const i = e("giftButton").getBoundingClientRect();
        s.resize(Math.max(240, i.width), Math.max(180, i.height)), s.render();
      };
      t(), K = new ResizeObserver(t), K.observe(e("giftButton")), s.render(0), s.reducedMotion = F.matches, s.start(), e("sceneLoading").hidden = true, v("idle"), e("openButton").disabled = false, e("giftButton").disabled = false;
    } catch {
      X();
    }
  } catch {
    Q(true);
  }
}
function Q(t = false) {
  v("missing");
  const i = document.createElement("div");
  i.className = "error-panel";
  const n = document.createElement("h1");
  n.textContent = o(t ? "loadErrorTitle" : "notFound");
  const d = document.createElement("p");
  if (d.textContent = o(t ? "loadErrorHint" : "notFoundHint"), i.append(n, d), t) {
    const c = document.createElement("button");
    c.className = "action primary", c.textContent = o("retry"), c.onclick = () => location.reload(), i.append(c);
  }
  const l = document.createElement("a");
  l.href = "index.html", l.textContent = o("back"), i.append(l), g.replaceChildren(i);
}
function X() {
  s == null || s.stop(), g.dataset.renderError = "true", e("sceneLoading").hidden = false, e("sceneLoading").textContent = o("sceneError"), e("openButton").textContent = o("viewGift"), e("openButton").disabled = false, e("giftButton").disabled = false, e("downloadVideo").disabled = true, k === "opening" ? P() : v("idle");
}
function fe() {
  const t = e("certificatePreview"), i = e("downloadCertificate");
  if (!a.file) {
    const n = document.createElement("div");
    n.className = "demo-certificate";
    for (const [d, l] of [["span", "Thauma"], ["h3", a.title || o("defaultTitle")], ["strong", a.amount || ""], ["small", o("demoCertificate")]]) {
      const c = document.createElement(d);
      c.textContent = l, n.append(c);
    }
    t.replaceChildren(n), i.setAttribute("aria-disabled", "true"), i.onclick = (d) => {
      d.preventDefault(), m(o("demoFile"));
    };
    return;
  }
  if (V = URL.createObjectURL(a.file.blob), i.href = V, i.download = a.file.name, i.onclick = async (n) => {
    var l;
    const d = new File([a.file.blob], a.file.name, { type: a.file.type });
    if (!U && ((l = navigator.canShare) != null && l.call(navigator, { files: [d] }))) {
      n.preventDefault();
      try {
        await navigator.share({ files: [d] });
      } catch (c) {
        c.name !== "AbortError" && (U = true, m(o("shareFallback")));
      }
    }
  }, a.file.type.startsWith("image/")) {
    const n = new Image();
    n.src = V, n.alt = a.title || o("defaultTitle"), t.replaceChildren(n);
  } else {
    const n = document.createElement("object");
    n.data = V, n.type = "application/pdf", n.title = a.title || o("defaultTitle");
    const d = document.createElement("p");
    d.textContent = o("pdfHint"), n.append(d), t.replaceChildren(n);
  }
}
function pe() {
  var t;
  (t = a.audio) != null && t.blob && (J = URL.createObjectURL(a.audio.blob), e("giftAudio").src = J, e("giftAudioPanel").hidden = false);
  mountAudioExport(a, O);
}
function me() {
  a.design === "scroll" ? (s.stop(), v("reading"), h.classList.remove("opening"), h.classList.add("reading"), e("scrollText").textContent = a.message || o("defaultMessage"), e("scrollText").hidden = false, e("openButton").textContent = o("showCertificate"), e("openButton").disabled = false, e("giftButton").disabled = false, e("sceneStatus").textContent = o("scrollGreeting"), e("openButton").focus({ preventScroll: true })) : P();
}
function P() {
  s?.stop();
  certificateTransition?.cancel();
  v('transition'); h.inert = true;
  certificateTransition = beginCertificateTransition({
    scene: g.dataset.renderError ? null : s,
    opening: h, reveal: C, preview: e('certificatePreview'), reducedMotion: F.matches,
  });
  certificateTransition.finished.then(completed => {
    if (!completed || k !== 'transition') return;
    h.hidden = true; h.inert = true; C.inert = false;
    C.classList.add('visible'); C.setAttribute('aria-hidden', 'false');
    v('revealed'); e('downloadCertificate').focus({preventScroll: true});
    certificateTransition = null;
  });
}
function te() {
  if (!T) {
    if (k === "reading") {
      P();
      return;
    }
    if (k === "idle") {
      if (g.dataset.renderError) {
        P();
        return;
      }
      v("opening"), h.classList.add("opening"), e("openButton").disabled = true, e("giftButton").disabled = true, e("sceneStatus").textContent = o("opening"), s.play({ onComplete: me, reducedMotion: F.matches });
    }
  }
}
function ge() {
  if (T) return;
  certificateTransition?.cancel(); certificateTransition = null;
  T || (clearTimeout(_), e("giftAudio").pause(), C.inert = true, C.classList.remove("visible"), C.setAttribute("aria-hidden", "true"), h.hidden = false, h.inert = false, h.classList.remove("opening", "exit", "reading"), e("scrollText").hidden = true, e("sceneStatus").textContent = "", e("openButton").textContent = o(g.dataset.renderError ? "viewGift" : "open"), e("openButton").disabled = false, e("giftButton").disabled = false, v("idle"), s == null || s.reset(), e("openButton").focus({ preventScroll: true }));
}
function O() {
  y = null, L && URL.revokeObjectURL(L), L = null, e("exportPreview").pause(), e("exportPreview").removeAttribute("src"), e("exportPreview").load(), e("exportPreview").hidden = true, e("saveVideo").hidden = true, e("saveHelp").hidden = true;
  e('downloadVideoFile').hidden=true;e('downloadVideoFile').removeAttribute('href');
}
e("personalVideo").onchange = () => {
  O(), e("privacyHint").textContent = o(e("personalVideo").checked ? "personalWarning" : "privacyHint"), e("privacyHint").classList.toggle("warning", e("personalVideo").checked), m("");
};
function Z(t, i, n, d, l) {
  const c = [];
  let u = "";
  for (const r of String(i).split(/\s+/)) {
    const f = u ? u + " " + r : r;
    t.measureText(f).width > 620 && u ? (c.push(u), u = r) : u = f;
  }
  u && c.push(u), c.slice(0, l).forEach((r, f) => t.fillText(r, 360, n + f * d, 620));
}
async function he() {
  if (T || g.dataset.renderError) return;
  if (!HTMLCanvasElement.prototype.captureStream || !window.MediaRecorder) {
    m(o("recordUnsupported"));
    return;
  }
  O(), T = true, g.classList.add("recording"), e("downloadVideo").disabled = true, e("downloadVideo").textContent = o("recording"), e("personalVideo").disabled = true, e("giftAudio").pause(), m("");
  let t = null, i = null, n = null, d = null, soundtrack = null, painter = null, phase='audio';
  x = new AbortController();
  e("soundVideo").disabled = true;
  try {
    soundtrack = await prepareSoundtrack(a.audio?.blob, e("soundVideo").checked, x.signal);
    const audioSeconds=soundtrack?.duration||0;
    phase='scene';
    if (x.signal.aborted) throw Error("Aborted");
    let E = function(p, elapsed = 0) {
      t.render(p, p * Y[a.design]);
      r.fillStyle = f ? '#0b191b' : '#e8f3ef'; r.fillRect(0, 0, 720, 1280);
      drawExportPresentation(r, t, {left:0, top:155, width:720, height:800}, (elapsed-Y[a.design])/PRESENTATION_SECONDS);
      r.textAlign = "center", r.fillStyle = f ? "#eef9f4" : "#153e36", r.font = "700 32px Arial", r.fillText("Thauma", 379, 82), re(r, 277, 50, 36, f ? "#eef9f4" : "#153e36"), r.font = "20px Arial", r.font = "28px Arial", Z(r, l.title || "", 992, 34, 2), r.font = "34px Georgia", r.fillText(l.amount || "", 360, 1080, 620), r.font = "24px Arial", Z(r, l.message || "", 1130, 32, 4);
    };
    const l = se(a, e("personalVideo").checked), c = document.createElement("canvas");
    t = await createGiftScene(c, { design: a.design, theme: a.theme, gift: l }, ee);
    if (x.signal.aborted) throw Error("Aborted");
    t.renderer.setPixelRatio(1), t.resize(720, 800);
    const u = e("videoCanvas"), r = u.getContext("2d"), f = a.theme === "dark";
    u.width = 720; u.height = 1280;
    // A normal inline preview, with progress on the prepare button. No floating
    // window covering the controls, and no second encoded video while recording.
    u.hidden = false;
    painter = createExportPainter({canvas:u, draw:E, sceneSeconds:Y[a.design], presentationSeconds:PRESENTATION_SECONDS,
      onStill:()=>{t?.dispose();t=null;c.width=1;c.height=1;}});
    E(0);
    // Keep a regular 30 fps capture clock. Manual requestFrame() on iOS can
    // produce MP4 timestamps with a huge media-time origin (the clip plays, but
    // native controls and uploaders can report hundreds of hours of duration).
    i = u.captureStream(30);
    if (soundtrack) i.addTrack(soundtrack.track);
    const totalDuration = recordingLength(Y[a.design], soundtrack?.duration || 0) * 1e3;
    const isIOS = /iP(?:hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // H.264 level 3.1 accommodates 720x1280 at 30 fps; level 3.0 does not.
    const w = (soundtrack ? ["video/mp4;codecs=avc1.42E01F,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"] : ["video/mp4;codecs=avc1.42E01F", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp8", "video/webm"]).find((p) => MediaRecorder.isTypeSupported(p));
    if (!w) throw Error("No recording format");
    n = new MediaRecorder(i, { mimeType: w, videoBitsPerSecond: 5e6 });
    const I = [];
    n.ondataavailable = (p) => {
      p.data.size && I.push(p.data);
    };
    let complete = false;
    const D = new Promise((p, A) => {
      n.onstop = () => complete ? p() : A(Error('Recording stopped early'));
      n.onerror = () => { A(Error('Recording failed')); x?.abort(); };
    });
    D.catch(() => {
    });
    const started = waitForMedia(n, 'start', x.signal);
    phase='recording';
    // Avoid one-second MP4 fragmentation for short iPhone exports. stop() still
    // emits the complete final Blob; timeslices remain for unusually long clips.
    if (isIOS && totalDuration <= 60000) n.start();
    else n.start(1000);
    await started;
    soundtrack?.start();
    await new Promise((p, A) => {
      let lastPercent = -1;
      const ne = performance.now(), ae = setTimeout(() => A(Error("Recording timeout")), totalDuration + 15e3), B = (S) => {
        clearTimeout(ae), S ? A(S) : p();
      };
      x.signal.addEventListener("abort", () => B(Error("Recording interrupted")), { once: true });
      function j(S) {
        if (!x.signal.aborted) {
          if (document.hidden || n.state !== 'recording') {
            B(Error("Recording hidden"));
            return;
          }
          try {
            const M = S - ne;
            painter.paint(M / 1000);
            const percent = Math.min(99, Math.floor(M / totalDuration * 100));
            if (percent !== lastPercent) {
              lastPercent = percent;
              e('downloadVideo').textContent = o('recording') + ' ' + percent + '%';
            }
            if (M >= totalDuration) {
              B();
              return;
            }
            d = requestAnimationFrame(j);
          } catch (M) {
            B(M);
          }
        }
      }
      d = requestAnimationFrame(j);
    });
    // Keep the completed still on the canvas briefly so the 30 fps capture
    // clock can submit final frames before Safari finalizes the MP4.
    await new Promise(resolve=>setTimeout(resolve,isIOS?220:60));
    complete = true;
    phase='finishing';
    const stopped = waitForMedia(n, 'stop', x.signal);
    n.stop();
    await stopped;
    await D;
    const R = n.mimeType || w;
    let N = new Blob(I, { type: R });
    I.length = 0;
    if (!N.size) throw Error("Empty recording");
    if (R.toLowerCase().includes("mp4")) N = await normalizeMp4Timeline(N, x.signal);
    // Release the encoder, audio graph and scene surfaces before a decoder is
    // created to validate the result. Mobile must not keep both pipelines live.
    i.getTracks().forEach(track=>track.stop()); i=null;
    await soundtrack?.close(); soundtrack=null;
    painter.dispose(); painter=null;
    t?.dispose(); t=null; c.width=1; c.height=1;
    u.hidden=true; u.width=1; u.height=1;
    n.ondataavailable=null; n.onstop=null; n.onerror=null; n=null;
    phase='checking';
    m(q === 'en' ? 'Checking the video file…' : 'Проверяем видеофайл…');
    e('downloadVideo').textContent=q==='en'?'Checking video…':'Проверяем видео…';
    const verified = await verifyVideo(N, totalDuration / 1000, x.signal,{audioSeconds});
    e('exportPreview').dataset.expectedDuration = String(totalDuration / 1000);
    e('exportPreview').dataset.actualDuration = String(verified.duration);
    y = new File([N], "thauma-" + a.design + "-opening." + (R.includes("mp4") ? "mp4" : "webm"), { type: R.split(";")[0] }), L = URL.createObjectURL(y), e("exportPreview").src = L, e("exportPreview").hidden = false, e("saveVideo").hidden = false, e("saveHelp").hidden = false, m(o("videoReady") + (R.includes("mp4") ? "" : " " + o("videoNoMp4")));
    e('downloadVideoFile').href=L;e('downloadVideoFile').download=y.name;e('downloadVideoFile').hidden=false;
    e('saveHelp').textContent=q==='en'
      ? 'For Photos, choose Save / share → Save Video if offered. Download video saves the file to Downloads.'
      : 'Для «Фото»: «Сохранить / поделиться» → «Сохранить видео», если этот пункт доступен. «Скачать видео» сохраняет файл в «Загрузки».';
    const seconds=verified.duration.toFixed(1).replace('.',q==='en'?'.':',');
    m((q==='en'?`Video ready: ${seconds} s. Choose how to save it.`:`Видео готово: ${seconds} с. Выберите способ сохранения.`)+(R.includes('mp4')?'':' '+o('videoNoMp4')));
    e('saveVideo').scrollIntoView({block:'center',behavior:'smooth'});
  } catch (error) {
    console.warn('Video export failed', error.name, error.code || error.message);
    O();
    const incomplete = error.code === 'INCOMPLETE_VIDEO';
    const stage=q==='en'?{audio:'audio preparation',scene:'animation preparation',recording:'recording',finishing:'finishing the file',checking:'checking the file'}[phase]:{audio:'подготовка звука',scene:'подготовка анимации',recording:'запись',finishing:'завершение файла',checking:'проверка файла'}[phase];
    const actual=Number.isFinite(error.actualDuration)?error.actualDuration.toFixed(1).replace('.',q==='en'?'.':','):null;
    const expected=Number.isFinite(error.expectedDuration)?error.expectedDuration.toFixed(1).replace('.',q==='en'?'.':','):null;
    const durationDetail=actual&&expected?(q==='en'?` (${actual} of ${expected} s)`:` (${actual} из ${expected} с)`):'';
    m(incomplete ? (q === 'en' ? `The video or audio is incomplete${durationDetail}. Keep the page open and try again.` : `Видео или звук записались не целиком${durationDetail}. Не сворачивайте страницу и попробуйте ещё раз.`) : (q==='en'?`Could not finish ${stage}.`:`Не удалось завершить этап «${stage}».`));
    e('revealStatus').dataset.exportError=phase+':'+(error.code||error.name);
  } finally {
    e('videoCanvas').hidden = true;
    await soundtrack?.close();
    e("soundVideo").disabled = !a.audio?.blob;
    cancelAnimationFrame(d), n && n.state !== "inactive" && n.stop(), i == null || i.getTracks().forEach((l) => l.stop()), t == null || t.dispose(), x = null, T = false, g.classList.remove("recording"), e("downloadVideo").disabled = false, e("downloadVideo").textContent = o("video"), e("personalVideo").disabled = false;
    painter?.dispose();
    e('videoCanvas').width=1;e('videoCanvas').height=1;
  }
}
async function we() {
  if(!y||e('saveVideo').disabled)return;
  e('saveVideo').disabled=true;
  try {m(saveMessage(await shareVideoFile(y),q));}
  catch(error){m(saveMessage(error,q));console.warn('Video share failed',error.name);}
  finally {e('saveVideo').disabled=false;}
}
e("giftButton").onclick = te;
e("openButton").onclick = te;
e("replayButton").onclick = ge;
e("downloadVideo").onclick = he;
e("saveVideo").onclick = we;
// A persistent, user-clicked download link is independent of the share promise.
// Do not replace/remove it immediately after clicking: keep the Blob URL alive.
e('downloadVideoFile').onclick=()=>{m(o('downloadStarted'));};
e("closeButton").onclick = () => {
  T || (window.opener ? window.close() : location.href = "index.html");
};
window.addEventListener("pagehide", () => {
  var t;
  certificateTransition?.finish();
  clearTimeout(_), s == null || s.stop(), (t = e("giftAudio")) == null || t.pause(), x == null || x.abort();
});
window.addEventListener("pageshow", () => {
  s && (k === "idle" || k === "opening") && s.start();
});
ue();
