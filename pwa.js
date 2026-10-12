(() => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }
  const button = document.getElementById('install-game-app');
  const message = document.getElementById('install-game-message');
  if (!button || !message) return;
  let installPrompt = null;
  const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isInstalled()) {
    button.textContent = '已安装游戏 App';
    button.disabled = true;
    message.textContent = '可以从手机桌面打开。';
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    button.textContent = '安装游戏 App';
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    button.textContent = '已安装游戏 App';
    button.disabled = true;
    message.textContent = '安装完成，可以从桌面图标打开。';
  });
  button.addEventListener('click', async () => {
    if (isInstalled()) {
      message.textContent = '游戏 App 已安装在这个设备上。';
      return;
    }
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      message.textContent = result.outcome === 'accepted' ? '正在安装游戏 App…' : '你可以稍后再安装。';
      installPrompt = null;
      return;
    }
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) {
      message.textContent = '请点浏览器的分享按钮，再选“添加到主屏幕”。';
    } else {
      message.textContent = '请打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。';
    }
  });
})();

