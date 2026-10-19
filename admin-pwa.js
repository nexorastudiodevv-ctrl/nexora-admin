const installButton = document.querySelector("[data-install-app]");
let installPrompt;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  showInstallNotice("تم تثبيت لوحة Nexora بنجاح.", "success");
});

function showInstallNotice(message, kind = "info") {
  const notice = document.querySelector("[data-notice]");
  notice.textContent = message;
  notice.dataset.kind = kind;
  notice.hidden = false;
}

installButton.addEventListener("click", async () => {
  if (!installPrompt) {
    showInstallNotice("على Android أو الكمبيوتر، استخدم خيار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» في قائمة المتصفح. على iPhone: اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية».");
    return;
  }

  try {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      showInstallNotice("جارٍ تثبيت لوحة Nexora.", "success");
    } else {
      showInstallNotice("يمكنك تثبيت اللوحة لاحقًا من قائمة المتصفح.");
    }
  } catch (error) {
    showInstallNotice(`تعذّر بدء التثبيت: ${error.message || "حاول من قائمة المتصفح."}`);
  } finally {
    installPrompt = null;
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
    .catch((error) => {
      showInstallNotice(`تعذّر تجهيز التطبيق دون اتصال: ${error.message || "تحقّق من HTTPS واستضافة الملفات."}`);
      console.error("Could not register the admin service worker.", error);
    });
}
