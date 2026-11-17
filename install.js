// "Install app" button for Android / Chrome. Chrome tells the page when it can be installed
// (beforeinstallprompt); we keep that offer and show a button that opens Chrome's install dialog.
// iPhone has no such event: there, use Safari > Share > Add to Home Screen.
(function () {
  let offer = null;
  let button = null;

  const installed = () => {
    try {
      return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    } catch (e) { return false; }
  };

  function hide() {
    if (button) { button.remove(); button = null; }
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); // we show our own button instead of Chrome's mini-bar
    if (installed()) return;
    offer = event;
    if (button) return;
    button = document.createElement("button");
    button.type = "button";
    button.className = "install-button";
    button.textContent = "Установить приложение";
    button.addEventListener("click", async () => {
      if (!offer) return;
      const prompt = offer;
      offer = null;
      hide();
      prompt.prompt();
      try { await prompt.userChoice; } catch (e) { /* closed without a choice */ }
    });
    document.body.append(button);
  });

  window.addEventListener("appinstalled", () => { offer = null; hide(); });
})();
