(() => {
  const CONFIG_URL = 'cloudSyncProjectUrl';
  const CONFIG_KEY = 'cloudSyncPublishableKey';
  const LEGACY_KEYS = new Set(['stockGameState', 'selectedCareer', 'cashRestored10000', 'oneSharePerStock', 'cashSet30000']);
  const isGameKey = key => key.startsWith('simulator') || LEGACY_KEYS.has(key);
  const originalSet = localStorage.setItem.bind(localStorage);
  const originalRemove = localStorage.removeItem.bind(localStorage);
  const status = document.getElementById('cloud-sync-status');
  const urlInput = document.getElementById('cloud-project-url');
  const keyInput = document.getElementById('cloud-publishable-key');
  const emailInput = document.getElementById('cloud-email');
  const passwordInput = document.getElementById('cloud-password');
  const connectButton = document.getElementById('cloud-connect');
  if (!status || !urlInput || !keyInput || !emailInput || !passwordInput || !connectButton) return;

  urlInput.value = localStorage.getItem(CONFIG_URL) || '';
  keyInput.value = localStorage.getItem(CONFIG_KEY) || '';
  let client = null;
  let syncing = false;
  let applyingRemote = false;
  const pendingWrites = new Map();
  const writeTimers = new Map();
  const setStatus = message => { status.textContent = message; };

  function loadSupabase() {
    if (window.supabase?.createClient) return Promise.resolve();
    if (window.__simulatorSupabaseLoading) return window.__simulatorSupabaseLoading;
    window.__simulatorSupabaseLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = resolve;
      script.onerror = () => reject(new Error('无法载入云端连接组件，请检查网络后重试。'));
      document.head.appendChild(script);
    });
    return window.__simulatorSupabaseLoading;
  }

  function ensureClient() {
    const url = urlInput.value.trim();
    const key = keyInput.value.trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key) throw new Error('请填写正确的 Supabase 项目网址和公开客户端密钥。');
    localStorage.setItem(CONFIG_URL, url);
    localStorage.setItem(CONFIG_KEY, key);
    if (!client) client = window.supabase.createClient(url, key);
    return client;
  }

  async function upload(key, value) {
    if (!syncing || applyingRemote || !isGameKey(key)) return;
    const db = client;
    const { error } = await db.from('simulator_sync').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) setStatus('云端保存失败：' + error.message);
  }

  function queueUpload(key, value) {
    if (!syncing || applyingRemote || !isGameKey(key)) return;
    pendingWrites.set(key, value);
    clearTimeout(writeTimers.get(key));
    writeTimers.set(key, setTimeout(async () => {
      const latest = pendingWrites.get(key);
      pendingWrites.delete(key);
      writeTimers.delete(key);
      await upload(key, latest);
    }, 250));
  }

  localStorage.setItem = (key, value) => {
    originalSet(key, value);
    queueUpload(String(key), String(value));
  };
  localStorage.removeItem = key => {
    originalRemove(key);
    if (syncing && !applyingRemote && isGameKey(String(key))) {
      client.from('simulator_sync').delete().eq('key', String(key)).then(({ error }) => {
        if (error) setStatus('云端删除失败：' + error.message);
      });
    }
  };

  async function startRealtime() {
    client.channel('simulator-cloud-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'simulator_sync' }, payload => {
        const row = payload.new || payload.old;
        if (!row?.key || !isGameKey(row.key)) return;
        applyingRemote = true;
        if (payload.eventType === 'DELETE') originalRemove(row.key);
        else originalSet(row.key, row.value);
        applyingRemote = false;
        setStatus('云端已同步更新。');
        clearTimeout(window.__simulatorRemoteReloadTimer);
        window.__simulatorRemoteReloadTimer = setTimeout(() => window.location.reload(), 250);
      })
      .subscribe((state, error) => {
        if (state === 'SUBSCRIBED') setStatus('已连接云端同步。此浏览器的模拟器数据会自动更新。');
        if (error) setStatus('云端实时连接出现问题：' + error.message);
      });
  }

  async function syncData() {
    const { data, error } = await client.from('simulator_sync').select('key,value');
    if (error) throw new Error(error.message);
    const remote = new Map((data || []).filter(row => isGameKey(row.key)).map(row => [row.key, row.value]));
    const local = new Map();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isGameKey(key)) local.set(key, localStorage.getItem(key));
    }
    syncing = false;
    applyingRemote = true;
    if (remote.size) {
      for (const key of local.keys()) if (!remote.has(key)) originalRemove(key);
      for (const [key, value] of remote) originalSet(key, value);
    }
    applyingRemote = false;
    syncing = true;
    for (const [key, value] of local) if (!remote.has(key)) await upload(key, value);
    await startRealtime();
    setStatus(remote.size
      ? '已连接。云端数据已载入；此设备新有的数据也已合并。'
      : '云端还没有数据，已将此设备现有数据作为初始数据上传。');
    if (remote.size) setTimeout(() => window.location.reload(), 250);
  }

  async function connect() {
    connectButton.disabled = true;
    setStatus('正在连接 Supabase…');
    try {
      await loadSupabase();
      ensureClient();
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        const { error } = await client.auth.signInWithPassword({ email: emailInput.value.trim(), password: passwordInput.value });
        if (error) throw error;
      }
      passwordInput.value = '';
      await syncData();
    } catch (error) {
      setStatus('连接失败：' + (error.message || '请检查网址、密钥、登录信息和数据库设置。'));
    } finally {
      connectButton.disabled = false;
    }
  }

  connectButton.addEventListener('click', connect);
  if (localStorage.getItem(CONFIG_URL) && localStorage.getItem(CONFIG_KEY)) {
    loadSupabase().then(async () => {
      try {
        ensureClient();
        const { data: { session } } = await client.auth.getSession();
        if (session) await syncData();
      } catch (error) {
        setStatus('尚未连接：' + (error.message || '请在此页登录并开启同步。'));
      }
    }).catch(error => setStatus(error.message));
  } else {
    setStatus('请先在 Supabase 建立项目、数据表和登录账号，再填写连接资料。');
  }
})();

