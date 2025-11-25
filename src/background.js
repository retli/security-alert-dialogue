let lastTabId = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    ?.setOptions({
      path: "popup/popup.html",
      enabled: true
    })
    .catch(() => {});
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!chrome.sidePanel?.open || !tab.id) return;
  lastTabId = tab.id;
  await chrome.sidePanel.open({ tabId: tab.id });
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "popup/popup.html"
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "openSidePanel") {
    const targetTabId = lastTabId ?? sender.tab?.id;
    if (!chrome.sidePanel?.open || !targetTabId) {
      sendResponse?.({ ok: false });
      return;
    }

    chrome.sidePanel
      .open({ tabId: targetTabId })
      .then(() =>
        chrome.sidePanel.setOptions({
          tabId: targetTabId,
          path: "popup/popup.html"
        })
      )
      .then(() => sendResponse?.({ ok: true }))
      .catch(() => sendResponse?.({ ok: false }));

    return true;
  }
  return undefined;
});

