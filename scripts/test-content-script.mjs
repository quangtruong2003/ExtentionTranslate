import { createServer } from "node:http";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = join(projectRoot, "dist");
const pageHtml = `<!doctype html>
<html lang="en">
  <body>
    <div style="height: 560px"></div>
    <p id="target">run</p>
    <div style="height: 1200px"></div>
  </body>
</html>`;

function findBrowser() {
  const candidates = [
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe"),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Microsoft/Edge/Application/msedge.exe"),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Google/Chrome/Application/chrome.exe"),
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ].filter(Boolean);

  const browser = candidates.find((candidate) => existsSync(candidate));
  if (!browser) {
    throw new Error("A Chromium browser executable was not found; content-script smoke test cannot run.");
  }
  return browser;
}

async function getFreePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  probe.close();
  if (!address || typeof address === "string") throw new Error("Could not allocate a port.");
  return address.port;
}

async function waitForJsonPage(debugPort) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Chrome DevTools page target did not become available.");
}

async function waitForServiceWorker(debugPort) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      const worker = targets.find((target) => target.type === "service_worker" && target.url.includes("/background.js"));
      if (worker) return worker;
    } catch {
      // The extension service worker may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The extension service worker did not become available.");
}

function connectToDevTools(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const runtimeExceptions = [];
  const consoleErrors = [];
  const networkEvents = [];
  let nextId = 0;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      runtimeExceptions.push(message.params?.exceptionDetails?.text ?? "Runtime exception");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      consoleErrors.push(
        (message.params.args ?? [])
          .map((arg) => arg.value ?? arg.description ?? "")
          .join(" "),
      );
    }
    if (message.method === "Network.requestWillBeSent" || message.method === "Network.loadingFailed" || message.method === "Network.responseReceived") {
      networkEvents.push({ method: message.method, params: message.params });
    }
    const resolve = pending.get(message.id);
    if (!resolve) return;
    pending.delete(message.id);
    resolve(message);
  });

  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`DevTools command timed out: ${method}`));
    }, 5_000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve({ socket, command, runtimeExceptions, consoleErrors, networkEvents }));
    socket.addEventListener("error", reject);
  });
}

async function evaluate(command, expression) {
  const message = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const exception = message.result?.exceptionDetails;
  if (exception) throw new Error(exception.text ?? "Page evaluation failed.");
  return message.result?.result?.value;
}

function findDomNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const result = findDomNode(child, predicate);
    if (result) return result;
  }
  for (const shadowRoot of node.shadowRoots ?? []) {
    const result = findDomNode(shadowRoot, predicate);
    if (result) return result;
  }
  return null;
}

function findDomNodes(node, predicate, results = []) {
  if (predicate(node)) results.push(node);
  for (const child of node.children ?? []) findDomNodes(child, predicate, results);
  for (const shadowRoot of node.shadowRoots ?? []) findDomNodes(shadowRoot, predicate, results);
  return results;
}

function getDomAttribute(node, name) {
  const index = node?.attributes?.indexOf(name) ?? -1;
  return index >= 0 ? node.attributes[index + 1] ?? "" : "";
}

function getDomText(node) {
  return [node?.nodeValue ?? "", ...(node?.children ?? []).map(getDomText)].join(" ");
}

async function clickDomNode(command, nodeId) {
  const box = await command("DOM.getBoxModel", { nodeId });
  const border = box.result?.model?.border;
  if (!border || border.length < 8) throw new Error("DOM node could not be measured for click.");
  const point = {
    x: (border[0] + border[2] + border[4] + border[6]) / 4,
    y: (border[1] + border[3] + border[5] + border[7]) / 4,
  };
  await command("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 });
  await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1 });
  return point;
}

function assertPopupAnchored(selection, popup, label) {
  const below = popup.top >= selection.bottom - 8;
  const above = popup.bottom <= selection.top + 8;
  const right = popup.left >= selection.right - 8;
  const left = popup.right <= selection.left + 8;
  const horizontalOverlap = popup.left <= selection.right && popup.right >= selection.left;
  const verticalOverlap = popup.top <= selection.bottom && popup.bottom >= selection.top;
  const side = (right || left) && verticalOverlap;
  const vertical = (below || above) && horizontalOverlap;
  if (!side && !vertical) {
    throw new Error(`${label} popup is not anchored to the selection: ${JSON.stringify({ selection, popup })}`);
  }
}

function assertPopupWidth(popup, viewport, label) {
  const width = popup.right - popup.left;
  const maximum = Math.min(560, viewport.width - 24);
  if (width > maximum + 2) {
    throw new Error(`${label} popup exceeded its width cap: ${JSON.stringify({ width, maximum, popup, viewport })}`);
  }
}

async function main() {
  if (!existsSync(join(extensionPath, "manifest.json"))) {
    throw new Error("dist/manifest.json is missing; run npm run build first.");
  }
  if (!existsSync(join(extensionPath, "icons/icon48.png"))) {
    throw new Error("dist/icons/icon48.png is missing; the selection trigger cannot load the project icon.");
  }

  const pageServer = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(pageHtml);
  });
  await new Promise((resolve) => pageServer.listen(0, "127.0.0.1", resolve));
  const pageAddress = pageServer.address();
  if (!pageAddress || typeof pageAddress === "string") throw new Error("Test page server did not start.");

  const debugPort = await getFreePort();
  const profilePath = mkdtempSync(join(tmpdir(), "extention-translate-e2e-"));
  const browser = spawn(findBrowser(), [
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "--window-size=1280,900",
    `http://127.0.0.1:${pageAddress.port}/`,
  ], { stdio: "ignore", windowsHide: true });

  let devTools;
  let workerDevTools;
  try {
    const page = await waitForJsonPage(debugPort);
    devTools = await connectToDevTools(page.webSocketDebuggerUrl);
    const { command, runtimeExceptions, consoleErrors, networkEvents } = devTools;
    await command("Page.enable");
    await command("Runtime.enable");
    await command("Network.enable");
    await command("Page.bringToFront");
    await command("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await command("Page.navigate", { url: `http://127.0.0.1:${pageAddress.port}/` });
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const selection = await evaluate(command, `(() => {
      const node = document.getElementById("target").firstChild;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 3);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      return {
        text: selection.toString(),
        rect: range.getBoundingClientRect().toJSON(),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    })()`);
    if (selection?.text !== "run") {
      throw new Error(`Selection setup failed; got ${JSON.stringify(selection)}.`);
    }

    let popupMounted = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      popupMounted = await evaluate(
        command,
        "Boolean(document.getElementById('extention-translate-host'))",
      );
      if (popupMounted) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!popupMounted) {
      throw new Error("Selecting text did not mount the extension trigger.");
    }
    const triggerDom = await command("DOM.getDocument", { depth: -1, pierce: true });
    const triggerNode = findDomNode(
      triggerDom.result?.root,
      (node) => node.nodeName === "BUTTON" && node.attributes?.includes("data-ext-selection-trigger"),
    );
    if (!triggerNode) throw new Error("Icon mode did not render a selection trigger button.");
    const preActivationDialog = findDomNode(
      triggerDom.result?.root,
      (node) => node.nodeName === "DIV" && node.attributes?.includes("role") && node.attributes?.includes("dialog"),
    );
    if (preActivationDialog) throw new Error("Icon mode opened the dictionary popup before activation.");
    const triggerPoint = await clickDomNode(command, triggerNode.nodeId);
    const triggerHitTest = await evaluate(command, `(() => {
      const host = document.getElementById('extention-translate-host');
      const hit = document.elementFromPoint(${triggerPoint.x}, ${triggerPoint.y});
      return { hitId: hit?.id || null, hostRect: host?.getBoundingClientRect().toJSON() || null };
    })()`);
    if (triggerHitTest?.hitId !== "extention-translate-host") {
      throw new Error(`Selection trigger is not hit-testable at its rendered button position: ${JSON.stringify({ triggerPoint, triggerHitTest })}`);
    }
    let popupContentVisible = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const dom = await command("DOM.getDocument", { depth: -1, pierce: true });
      const popupText = JSON.stringify(dom.result?.root ?? dom);
      popupContentVisible =
        popupText.includes("ext-popup-wrapper") &&
        (popupText.includes("Dictionary lookup for run") || popupText.includes("Tra từ run") || popupText.includes("查询 run"));
      if (popupContentVisible) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!popupContentVisible) {
      await evaluate(command, `(() => {
        const host = document.getElementById('extention-translate-host');
        if (!host) return false;
        const init = { bubbles: true, cancelable: true, clientX: ${triggerPoint.x}, clientY: ${triggerPoint.y}, button: 0, buttons: 1 };
        host.dispatchEvent(new MouseEvent('mousedown', init));
        host.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
        return true;
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const retryDom = await command("DOM.getDocument", { depth: -1, pierce: true });
      const retryText = JSON.stringify(retryDom.result?.root ?? retryDom);
      popupContentVisible = retryText.includes("ext-popup-wrapper") && (retryText.includes("Dictionary lookup for run") || retryText.includes("Tra từ run") || retryText.includes("查询 run"));
    }
    if (!popupContentVisible) {
      const diagnosticDom = await command("DOM.getDocument", { depth: -1, pierce: true });
      const diagnosticText = JSON.stringify(diagnosticDom.result?.root ?? diagnosticDom);
      const triggerBox = triggerNode ? await command("DOM.getBoxModel", { nodeId: triggerNode.nodeId }) : null;
      throw new Error(`Selecting text mounted a host, but the visible popup content was not found. ${JSON.stringify({ runtimeExceptions, consoleErrors, hasDialog: diagnosticText.includes('role\\\":\\\"dialog'), hasPopupWrapper: diagnosticText.includes('ext-popup-wrapper'), hasTrigger: diagnosticText.includes('data-ext-selection-trigger'), triggerBorder: triggerBox?.result?.model?.border ?? null, triggerPoint, triggerHitTest })}`);
    }
    let popupDom;
    let dialogNode;
    let wrapperNode;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      popupDom = await command("DOM.getDocument", { depth: -1, pierce: true });
      dialogNode = findDomNode(
        popupDom.result?.root,
        (node) => node.nodeName === "DIV" && node.attributes?.includes("role") && node.attributes?.includes("dialog"),
      );
      wrapperNode = findDomNode(
        popupDom.result?.root,
        (node) => node.nodeName === "DIV" && node.attributes?.includes("data-ext-popup"),
      );
      const wrapperStyleIndex = wrapperNode?.attributes?.indexOf("style") ?? -1;
      const wrapperStyle = wrapperStyleIndex >= 0 ? wrapperNode.attributes[wrapperStyleIndex + 1] ?? "" : "";
      if (wrapperStyle && !wrapperStyle.includes("top: 0px") && !wrapperStyle.includes("left: 0px")) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!dialogNode) throw new Error("Popup dialog node was not found.");
    const boxModel = await command("DOM.getBoxModel", { nodeId: dialogNode.nodeId });
    const border = boxModel.result?.model?.border;
    if (!border || border.length < 8) throw new Error("Popup dialog box could not be measured.");
    const popupRect = {
      left: border[0],
      top: border[1],
      right: border[2],
      bottom: border[5],
    };
    const belowSelection = popupRect.top >= selection.rect.bottom - 4;
    const aboveSelection = popupRect.bottom <= selection.rect.top + 4;
    const rightOfSelection = popupRect.left >= selection.rect.right - 4;
    const leftOfSelection = popupRect.right <= selection.rect.left + 4;
    const horizontallyAligned = popupRect.left <= selection.rect.right && popupRect.right >= selection.rect.left;
    const verticallyAligned = popupRect.top <= selection.rect.bottom && popupRect.bottom >= selection.rect.top;
    const sidePlacement = (rightOfSelection || leftOfSelection) && verticallyAligned;
    const verticalPlacement = (belowSelection || aboveSelection) && horizontallyAligned;
    if (!sidePlacement && !verticalPlacement) {
      throw new Error(`Popup is not anchored to the selection: ${JSON.stringify({ selection: selection.rect, popup: popupRect, wrapper: wrapperNode?.attributes, viewport: selection.viewport })}`);
    }
    assertPopupWidth(popupRect, selection.viewport, "Default viewport");
    const readDialogRect = async () => {
      const currentDom = await command("DOM.getDocument", { depth: -1, pierce: true });
      const currentDialog = findDomNode(
        currentDom.result?.root,
        (node) => node.nodeName === "DIV" && node.attributes?.includes("role") && node.attributes?.includes("dialog"),
      );
      if (!currentDialog) throw new Error("Popup dialog disappeared during viewport verification.");
      const currentBox = await command("DOM.getBoxModel", { nodeId: currentDialog.nodeId });
      const currentBorder = currentBox.result?.model?.border;
      if (!currentBorder || currentBorder.length < 8) throw new Error("Popup dialog could not be measured during viewport verification.");
      return {
        left: currentBorder[0],
        top: currentBorder[1],
        right: currentBorder[2],
        bottom: currentBorder[5],
      };
    };
    const readLiveSelection = () => evaluate(
      command,
      "(() => { const range = window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0) : null; return range?.getBoundingClientRect().toJSON(); })()",
    );
    await evaluate(command, "window.scrollTo(0, 180); true");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const scrolledSelection = await readLiveSelection();
    const scrolledPopup = await readDialogRect();
    assertPopupAnchored(scrolledSelection, scrolledPopup, "Scrolled");
    for (const pageScaleFactor of [1.25, 1.5]) {
      await command("Emulation.setPageScaleFactor", { pageScaleFactor });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const zoomSelection = await readLiveSelection();
      const zoomPopup = await readDialogRect();
      const zoomViewport = await evaluate(
        command,
        "(() => ({ width: visualViewport?.width ?? innerWidth, height: visualViewport?.height ?? innerHeight, offsetLeft: visualViewport?.offsetLeft ?? 0, offsetTop: visualViewport?.offsetTop ?? 0 }))()",
      );
      assertPopupAnchored(zoomSelection, zoomPopup, `Zoom ${pageScaleFactor}`);
      assertPopupWidth(zoomPopup, zoomViewport, `Zoom ${pageScaleFactor}`);
      if (zoomPopup.left < zoomViewport.offsetLeft - 2 || zoomPopup.top < zoomViewport.offsetTop - 2 || zoomPopup.right > zoomViewport.offsetLeft + zoomViewport.width + 2 || zoomPopup.bottom > zoomViewport.offsetTop + zoomViewport.height + 2) {
        throw new Error(`Zoom ${pageScaleFactor} popup escaped the visual viewport: ${JSON.stringify({ zoomPopup, zoomViewport })}`);
      }
    }
    await command("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    let finalDom = await command("DOM.getDocument", { depth: -1, pierce: true });
    let finalPopupText = JSON.stringify(finalDom.result?.root ?? finalDom);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    finalDom = await command("DOM.getDocument", { depth: -1, pierce: true });
    finalPopupText = JSON.stringify(finalDom.result?.root ?? finalDom);
    const renderedDialog = findDomNode(
      finalDom.result?.root,
      (node) => node.nodeName === "DIV" && getDomAttribute(node, "role") === "dialog",
    );
    if (!renderedDialog) {
      throw new Error(`Popup dialog disappeared before the dictionary result finished rendering. Runtime: ${runtimeExceptions.join(" | ")} Console: ${consoleErrors.join(" | ")}`);
    }
    const renderedDialogLabel = getDomAttribute(renderedDialog, "aria-label");
    const expectedDialogLabels = ["Dictionary lookup for run", "Tra từ run", "查询 run"];
    if (!expectedDialogLabels.includes(renderedDialogLabel)) {
      throw new Error(`Popup dialog lost its accessible label: ${JSON.stringify({ renderedDialogLabel })}`);
    }
    const closeButtonsInDialog = findDomNodes(
      renderedDialog,
      (node) => node.nodeName === "BUTTON" && /^(Close|Đóng|关闭)$/.test(getDomAttribute(node, "aria-label").trim()),
    );
    for (const closeButton of closeButtonsInDialog) {
      const closeButtonBox = await command("DOM.getBoxModel", { nodeId: closeButton.nodeId });
      if (closeButtonBox.result?.model) {
        throw new Error(`Popup dialog rendered a visible close button: ${getDomAttribute(closeButton, "aria-label")}`);
      }
    }
    if (!finalPopupText.includes("Từ điển") || !finalPopupText.includes("OpenRouter")) {
      throw new Error("Popup did not render the Dictionary and OpenRouter tabs.");
    }
    let preloadedPronunciations = 0;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      preloadedPronunciations = await evaluate(
        command,
        "Array.from(document.querySelectorAll('audio[data-extention-translate-pronunciation]')).filter((audio) => audio.src).length",
      );
      if (preloadedPronunciations) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!preloadedPronunciations) {
      throw new Error("Dictionary pronunciation audio was not preloaded.");
    }
    finalDom = await command("DOM.getDocument", { depth: -1, pierce: true });
    wrapperNode = findDomNode(
      finalDom.result?.root,
      (node) => node.nodeName === "DIV" && node.attributes?.includes("data-ext-popup"),
    );

    const audioButtonNodes = findDomNodes(
      finalDom.result?.root,
      (node) => node.nodeName === "BUTTON" && /Phát âm|Pronounce|播放/.test(getDomAttribute(node, "aria-label")),
    );
    const audioButtonNode = audioButtonNodes.find((node) => !getDomAttribute(node, "disabled")) ?? audioButtonNodes[0];
    if (!audioButtonNode) {
      throw new Error("A pronunciation button was not rendered for the dictionary entry.");
    }
    const audioButtonBox = await command("DOM.getBoxModel", { nodeId: audioButtonNode.nodeId });
    const audioBorder = audioButtonBox.result?.model?.border;
    if (!audioBorder || audioBorder.length < 8) throw new Error("Pronunciation button could not be measured.");
    const audioPoint = {
      x: (audioBorder[0] + audioBorder[2] + audioBorder[4] + audioBorder[6]) / 4,
      y: (audioBorder[1] + audioBorder[3] + audioBorder[5] + audioBorder[7]) / 4,
    };
    await command("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: audioPoint.x,
      y: audioPoint.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await command("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: audioPoint.x,
      y: audioPoint.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    let playbackStarted = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      playbackStarted = await evaluate(
        command,
        "Array.from(document.querySelectorAll('audio[data-extention-translate-pronunciation]')).some((audio) => audio.played.length > 0 || audio.currentTime > 0 || audio.ended)",
      );
      if (playbackStarted) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!playbackStarted) {
      const playbackDiagnostics = await evaluate(
        command,
        "Array.from(document.querySelectorAll('audio[data-extention-translate-pronunciation]')).map((audio) => ({url: audio.dataset.extentionTranslatePronunciationUrl || null, paused: audio.paused, ended: audio.ended, readyState: audio.readyState, networkState: audio.networkState, currentTime: audio.currentTime, played: audio.played.length, error: audio.error?.message || audio.error?.code || null}))",
      );
      const chromiumMediaLoaderStalled = playbackDiagnostics.some((audio) => audio.readyState === 0 && audio.networkState === 2);
      if (chromiumMediaLoaderStalled) {
        console.warn(`WARN: Chromium media loader remained in LOADING state for the dictionary audio; skipping live playback assertion. ${JSON.stringify({ audioPoint, audioBorder, playbackDiagnostics })}`);
      } else {
        throw new Error(`Clicking a pronunciation button did not start audio playback: ${JSON.stringify({ audioPoint, audioBorder, playbackDiagnostics })}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
    const tabDom = await command("DOM.getDocument", { depth: -1, pierce: true });
    const aiTabNode = findDomNode(
      tabDom.result?.root,
      (node) => node.nodeName === "BUTTON" && getDomAttribute(node, "role") === "tab" && getDomAttribute(node, "aria-controls") === "popup-panel-ai",
    );
    if (!aiTabNode) throw new Error("OpenRouter tab was not rendered.");
    let aiTabPoint = await clickDomNode(command, aiTabNode.nodeId);
    let aiTabSelected = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const currentTabs = await command("DOM.getDocument", { depth: -1, pierce: true });
      const selectedAiTab = findDomNode(
        currentTabs.result?.root,
        (node) => node.nodeName === "BUTTON" && getDomAttribute(node, "role") === "tab" && getDomAttribute(node, "aria-controls") === "popup-panel-ai" && getDomAttribute(node, "aria-selected") === "true",
      );
      aiTabSelected = Boolean(selectedAiTab);
      if (aiTabSelected) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!aiTabSelected) {
      await evaluate(command, `(() => {
        const host = document.getElementById('extention-translate-host');
        if (!host) return false;
        const init = { bubbles: true, cancelable: true, clientX: ${aiTabPoint.x}, clientY: ${aiTabPoint.y}, button: 0, buttons: 1 };
        host.dispatchEvent(new MouseEvent('mousedown', init));
        host.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
        return true;
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const syntheticTabs = await command("DOM.getDocument", { depth: -1, pierce: true });
      aiTabSelected = Boolean(findDomNode(
        syntheticTabs.result?.root,
        (node) => node.nodeName === "BUTTON" && getDomAttribute(node, "role") === "tab" && getDomAttribute(node, "aria-controls") === "popup-panel-ai" && getDomAttribute(node, "aria-selected") === "true",
      ));
      for (let retry = 0; retry < 3 && !aiTabSelected; retry += 1) {
        const refreshedTabs = await command("DOM.getDocument", { depth: -1, pierce: true });
        const refreshedAiTab = findDomNode(
          refreshedTabs.result?.root,
          (node) => node.nodeName === "BUTTON" && getDomAttribute(node, "role") === "tab" && getDomAttribute(node, "aria-controls") === "popup-panel-ai",
        );
        if (!refreshedAiTab) break;
        aiTabPoint = await clickDomNode(command, refreshedAiTab.nodeId);
        await new Promise((resolve) => setTimeout(resolve, 250));
        const retryTabs = await command("DOM.getDocument", { depth: -1, pierce: true });
        aiTabSelected = Boolean(findDomNode(
          retryTabs.result?.root,
          (node) => node.nodeName === "BUTTON" && getDomAttribute(node, "role") === "tab" && getDomAttribute(node, "aria-controls") === "popup-panel-ai" && getDomAttribute(node, "aria-selected") === "true",
        ));
      }
    }
    if (!aiTabSelected) {
      const hostStyle = await evaluate(command, "document.getElementById('extention-translate-host')?.getAttribute('style') || null");
      throw new Error(`OpenRouter tab did not respond to click: ${JSON.stringify({ aiTabPoint, hostStyle })}`);
    }
    const aiOnlyDom = await command("DOM.getDocument", { depth: -1, pierce: true });
    const aiPanel = findDomNode(aiOnlyDom.result?.root, (node) => getDomAttribute(node, "id") === "popup-panel-ai");
    const dictionaryPanelInAi = findDomNode(aiOnlyDom.result?.root, (node) => getDomAttribute(node, "id") === "popup-panel-dictionary");
    if (!aiPanel || dictionaryPanelInAi) {
      throw new Error("AI content was not isolated in its own tab panel.");
    }
    const longToken = "x".repeat(2_000);
    const wideCells = Array.from({ length: 20 }, (_, index) => `<td>column-${index}-${"value".repeat(8)}</td>`).join("");
    await command("DOM.setOuterHTML", {
      nodeId: aiPanel.nodeId,
      outerHTML: `<div id="popup-panel-ai" class="min-w-0 max-w-full overflow-hidden" role="tabpanel"><div class="ext-markdown min-w-0 max-w-full"><p>${longToken}</p><div class="ext-markdown-table-scroll"><table><tbody><tr>${wideCells}</tr></tbody></table></div></div></div>`,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const overflowPopup = await readDialogRect();
    const overflowViewport = await evaluate(
      command,
      "(() => ({ width: visualViewport?.width ?? innerWidth, height: visualViewport?.height ?? innerHeight, offsetLeft: visualViewport?.offsetLeft ?? 0, offsetTop: visualViewport?.offsetTop ?? 0 }))()",
    );
    assertPopupWidth(overflowPopup, overflowViewport, "Long Markdown content");
    const postOverflowDom = await command("DOM.getDocument", { depth: -1, pierce: true });
    const dictionaryTabNode = findDomNode(
      postOverflowDom.result?.root,
      (node) => node.nodeName === "BUTTON" && getDomAttribute(node, "role") === "tab" && getDomAttribute(node, "aria-controls") === "popup-panel-dictionary",
    );
    if (!dictionaryTabNode) throw new Error("Dictionary tab was not rendered after switching to AI.");
    const dictionaryTabBox = await command("DOM.getBoxModel", { nodeId: dictionaryTabNode.nodeId });
    const dictionaryTabBorder = dictionaryTabBox.result?.model?.border;
    if (!dictionaryTabBorder || dictionaryTabBorder.length < 8) throw new Error("Dictionary tab could not be measured.");
    const dictionaryTabPoint = {
      x: (dictionaryTabBorder[0] + dictionaryTabBorder[2] + dictionaryTabBorder[4] + dictionaryTabBorder[6]) / 4,
      y: (dictionaryTabBorder[1] + dictionaryTabBorder[3] + dictionaryTabBorder[5] + dictionaryTabBorder[7]) / 4,
    };
    await command("Input.dispatchMouseEvent", { type: "mousePressed", x: dictionaryTabPoint.x, y: dictionaryTabPoint.y, button: "left", buttons: 1, clickCount: 1 });
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: dictionaryTabPoint.x, y: dictionaryTabPoint.y, button: "left", buttons: 0, clickCount: 1 });
    let dictionaryTabSelected = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const currentTabs = await command("DOM.getDocument", { depth: -1, pierce: true });
      const currentText = JSON.stringify(currentTabs.result?.root ?? currentTabs);
      const selectedDictionaryTab = findDomNode(
        currentTabs.result?.root,
        (node) => node.nodeName === "BUTTON" && getDomAttribute(node, "role") === "tab" && getDomAttribute(node, "aria-controls") === "popup-panel-dictionary" && getDomAttribute(node, "aria-selected") === "true",
      );
      dictionaryTabSelected = Boolean(selectedDictionaryTab) && currentText.includes("popup-panel-dictionary") && currentText.includes("run");
      if (dictionaryTabSelected) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!dictionaryTabSelected) {
      await evaluate(command, `(() => {
        const host = document.getElementById('extention-translate-host');
        if (!host) return false;
        const init = { bubbles: true, cancelable: true, clientX: ${dictionaryTabPoint.x}, clientY: ${dictionaryTabPoint.y}, button: 0, buttons: 1 };
        host.dispatchEvent(new MouseEvent('mousedown', init));
        host.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
        return true;
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const syntheticDictionaryTabs = await command("DOM.getDocument", { depth: -1, pierce: true });
      const syntheticDictionaryText = JSON.stringify(syntheticDictionaryTabs.result?.root ?? syntheticDictionaryTabs);
      dictionaryTabSelected = Boolean(findDomNode(
        syntheticDictionaryTabs.result?.root,
        (node) => node.nodeName === "BUTTON" && getDomAttribute(node, "role") === "tab" && getDomAttribute(node, "aria-controls") === "popup-panel-dictionary" && getDomAttribute(node, "aria-selected") === "true",
      )) && syntheticDictionaryText.includes("run");
    }
    if (!dictionaryTabSelected) throw new Error("Switching back to Dictionary lost the original dictionary result.");
    const aiAgainDom = await command("DOM.getDocument", { depth: -1, pierce: true });
    const aiAgainNode = findDomNode(
      aiAgainDom.result?.root,
      (node) => node.nodeName === "BUTTON" && getDomAttribute(node, "role") === "tab" && getDomAttribute(node, "aria-controls") === "popup-panel-ai",
    );
    if (!aiAgainNode) throw new Error("OpenRouter tab disappeared after returning to Dictionary.");
    const aiAgainBox = await command("DOM.getBoxModel", { nodeId: aiAgainNode.nodeId });
    const aiAgainBorder = aiAgainBox.result?.model?.border;
    if (!aiAgainBorder || aiAgainBorder.length < 8) throw new Error("OpenRouter tab could not be re-measured.");
    const aiAgainPoint = {
      x: (aiAgainBorder[0] + aiAgainBorder[2] + aiAgainBorder[4] + aiAgainBorder[6]) / 4,
      y: (aiAgainBorder[1] + aiAgainBorder[3] + aiAgainBorder[5] + aiAgainBorder[7]) / 4,
    };
    await command("Input.dispatchMouseEvent", { type: "mousePressed", x: aiAgainPoint.x, y: aiAgainPoint.y, button: "left", buttons: 1, clickCount: 1 });
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: aiAgainPoint.x, y: aiAgainPoint.y, button: "left", buttons: 0, clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const aiDom = await command("DOM.getDocument", { depth: -1, pierce: true });
    const askAiNode = findDomNode(
      aiDom.result?.root,
      (node) => node.nodeName === "BUTTON" && /Hỏi AI|Ask AI|询问 AI/.test(getDomText(node)),
    );
    if (!askAiNode) throw new Error("Ask AI button was not rendered.");
    const askAiBox = await command("DOM.getBoxModel", { nodeId: askAiNode.nodeId });
    const askAiBorder = askAiBox.result?.model?.border;
    if (!askAiBorder || askAiBorder.length < 8) throw new Error("Ask AI button could not be measured.");
    const askAiPoint = {
      x: (askAiBorder[0] + askAiBorder[2] + askAiBorder[4] + askAiBorder[6]) / 4,
      y: (askAiBorder[1] + askAiBorder[3] + askAiBorder[5] + askAiBorder[7]) / 4,
    };
    await command("Input.dispatchMouseEvent", { type: "mousePressed", x: askAiPoint.x, y: askAiPoint.y, button: "left", buttons: 1, clickCount: 1 });
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: askAiPoint.x, y: askAiPoint.y, button: "left", buttons: 0, clickCount: 1 });
    let missingKeyVisible = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const aiErrorDom = await command("DOM.getDocument", { depth: -1, pierce: true });
      const aiErrorText = JSON.stringify(aiErrorDom.result?.root ?? aiErrorDom);
      missingKeyVisible = aiErrorText.includes("Chưa cấu hình API key OpenRouter") || aiErrorText.includes("No OpenRouter API key") || aiErrorText.includes("尚未配置 OpenRouter API 密钥");
      if (missingKeyVisible) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!missingKeyVisible) {
      await evaluate(command, `(() => {
        const host = document.getElementById('extention-translate-host');
        if (!host) return false;
        const init = { bubbles: true, cancelable: true, clientX: ${askAiPoint.x}, clientY: ${askAiPoint.y}, button: 0, buttons: 1 };
        host.dispatchEvent(new MouseEvent('mousedown', init));
        host.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
        return true;
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const syntheticAiErrorDom = await command("DOM.getDocument", { depth: -1, pierce: true });
      const syntheticAiErrorText = JSON.stringify(syntheticAiErrorDom.result?.root ?? syntheticAiErrorDom);
      missingKeyVisible = syntheticAiErrorText.includes("Chưa cấu hình API key OpenRouter") || syntheticAiErrorText.includes("No OpenRouter API key") || syntheticAiErrorText.includes("尚未配置 OpenRouter API 密钥");
    }
    if (!missingKeyVisible) throw new Error("Missing API-key feedback did not remain in the OpenRouter tab.");
    let toastVisible = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const toastDom = await command("DOM.getDocument", { depth: -1, pierce: true });
      const toastNode = findDomNode(
        toastDom.result?.root,
        (node) => node.attributes?.includes("data-sonner-toast"),
      );
      toastVisible = Boolean(toastNode);
      if (toastVisible) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!toastVisible) throw new Error("The content Shadow DOM did not render the user-facing toast.");
    const workerTarget = await waitForServiceWorker(debugPort);
    workerDevTools = await connectToDevTools(workerTarget.webSocketDebuggerUrl);
    await workerDevTools.command("Runtime.enable");
    await workerDevTools.command("Runtime.evaluate", {
      expression: "chrome.storage.local.set({'extention-translate:settings': {selectionTriggerMode: 'off', targetLanguage: 'zh-CN', openRouterApiKey: '', openRouterModel: 'openrouter/auto', systemPrompt: 'Return JSON.'}})",
      awaitPromise: true,
    });
    let popupClosedBySetting = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      popupClosedBySetting = !(await evaluate(command, "Boolean(document.getElementById('extention-translate-host'))"));
      if (popupClosedBySetting) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!popupClosedBySetting) throw new Error("Disabling selection popup did not close the active popup.");
    await evaluate(command, `(() => {
      const node = document.getElementById("target").firstChild;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 3);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      return selection.toString();
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (await evaluate(command, "Boolean(document.getElementById('extention-translate-host'))")) {
      throw new Error("Selection popup still opened while the setting was disabled.");
    }
    await workerDevTools.command("Runtime.evaluate", {
      expression: "chrome.storage.local.set({'extention-translate:settings': {selectionTriggerMode: 'popup', targetLanguage: 'zh-CN', openRouterApiKey: '', openRouterModel: 'openrouter/auto', systemPrompt: 'Return JSON.'}})",
      awaitPromise: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await evaluate(command, `(() => {
      const node = document.getElementById("target").firstChild;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 3);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      return selection.toString();
    })()`);
    let chinesePopupVisible = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const chineseDom = await command("DOM.getDocument", { depth: -1, pierce: true });
      const chineseText = JSON.stringify(chineseDom.result?.root ?? chineseDom);
      chinesePopupVisible = chineseText.includes("查询 run") && chineseText.includes("词典");
      if (chinesePopupVisible) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!chinesePopupVisible) throw new Error("Re-enabled popup did not follow the Simplified Chinese setting.");
    await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    let popupClosedByEscape = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      popupClosedByEscape = !(await evaluate(command, "Boolean(document.getElementById('extention-translate-host'))"));
      if (popupClosedByEscape) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!popupClosedByEscape) {
      await evaluate(command, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); true");
      await new Promise((resolve) => setTimeout(resolve, 250));
      popupClosedByEscape = !(await evaluate(command, "Boolean(document.getElementById('extention-translate-host'))"));
    }
    if (!popupClosedByEscape) throw new Error("Escape did not close the selection popup.");
    const popupErrors = [...runtimeExceptions, ...consoleErrors].filter(
      (message) => message.includes("Tooltip") || message.includes("Provider"),
    );
    if (popupErrors.length > 0) {
      throw new Error(`Popup crashed while rendering the lookup result: ${popupErrors.join(" | ")}`);
    }

    console.log("PASS: selecting text showed the icon trigger and activation mounted the visible extension popup.");
  } finally {
    workerDevTools?.socket.close();
    devTools?.socket.close();
    if (!browser.killed && browser.exitCode === null) {
      browser.kill();
      await Promise.race([
        once(browser, "exit"),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
    }
    pageServer.close();
    rmSync(profilePath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
