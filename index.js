(function () {
    'use strict';
    if (window.__TM_TT_TEST_LOADED__) return;
    window.__TM_TT_TEST_LOADED__ = true;

    const IDB_NAME = 'tm-tt-test-v1';
    const IDB_STORE = 'meta';
    const state = {
        themes: [], meta: {}, query: '', category: '__all__',
        open: false, busy: false, db: null,
        ui: { mode: 'light', accent: '#8b75c9', fabSize: 48, columns: 2 }
    };
    const $ = (s, r=document) => r.querySelector(s);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
    const log = (...a) => console.log('[TM-TT试用版]', ...a);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    function dbGet(key) {
        return new Promise((resolve, reject) => {
            const req = state.db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    function dbPut(key, value) {
        return new Promise((resolve, reject) => {
            const tx = state.db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        });
    }
    async function csrfHeaders() {
        const r = await fetch('/csrf-token');
        if (!r.ok) throw new Error('读取 CSRF token 失败：' + r.status);
        const d = await r.json();
        return { 'Content-Type': 'application/json', 'X-CSRF-Token': d.token };
    }
    async function readThemes() {
        const headers = await csrfHeaders();
        const r = await fetch('/api/settings/get', {
            method: 'POST', headers, body: '{}', cache: 'no-cache'
        });
        if (!r.ok) throw new Error('读取酒馆主题列表失败：' + r.status);
        const data = await r.json();
        if (!data || !Array.isArray(data.themes)) {
            throw new Error('酒馆返回的数据中没有 themes 数组，当前 TT API 结构可能不同。');
        }
        return data.themes.filter(t => t && typeof t.name === 'string' && t.name.trim());
    }
    function currentTheme() {
        const el = $('#themes');
        return (window.power_user && window.power_user.theme) || (el && el.value) || '';
    }
    async function applyTheme(name) {
        if (state.busy) return;
        const theme = state.themes.find(t => t.name === name);
        if (!theme) throw new Error('找不到主题：' + name);
        const el = $('#themes');
        if (!el) throw new Error('找不到酒馆原生主题控件 #themes。');
        const option = Array.from(el.options || []).find(o => o.value === name || o.textContent.trim() === name);
        if (el.tagName === 'SELECT' && !option) {
            throw new Error('主题库存里有该主题，但原生选择框没有对应选项；可能尚未被 TT 加载。');
        }
        state.busy = true; render();
        try {
            if (el.tagName === 'SELECT') el.value = option.value;
            else {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                if (setter) setter.call(el, name); else el.value = name;
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(350);
            const actual = currentTheme();
            if (actual && actual !== name) {
                throw new Error('切换后酒馆当前主题仍是「' + actual + '」，请求目标为「' + name + '」。');
            }
            const m = state.meta[name] || {};
            m.useCount = (m.useCount || 0) + 1;
            m.lastUsed = Date.now();
            state.meta[name] = m;
            await dbPut('themeMeta', state.meta);
            toast('已请求酒馆切换到：' + name);
        } finally {
            state.busy = false; render();
        }
    }
    function toast(msg, bad=false) {
        const el = $('#tmtt-toast');
        if (!el) return;
        el.textContent = msg; el.classList.toggle('bad', bad);
        el.classList.add('show'); clearTimeout(el._timer);
        el._timer = setTimeout(() => el.classList.remove('show'), 2600);
    }
    function categories() {
        return ['__all__', ...new Set(Object.values(state.meta).map(m => m.category).filter(Boolean))];
    }
    function filtered() {
        const q = state.query.toLowerCase();
        return state.themes.filter(t => {
            const m = state.meta[t.name] || {};
            const catOk = state.category === '__all__' || (m.category || '未分类') === state.category;
            const text = [t.name, m.author, m.description, ...(m.tags || [])].join(' ').toLowerCase();
            return catOk && (!q || text.includes(q));
        });
    }
    function styleText() {
        const dark = state.ui.mode === 'dark';
        const vars = dark
            ? '--bg:#17171c;--panel:#202027;--card:#282831;--text:#f0eff5;--muted:#a6a3b0;--line:#393844;--input:#292832;'
            : '--bg:#f4f4f7;--panel:#fff;--card:#fff;--text:#24232a;--muted:#777481;--line:#e6e4eb;--input:#f7f6fa;';
        return `
        #tmtt-root{${vars}--accent:${state.ui.accent};--accent-soft:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--text);font:14px/1.45 system-ui,-apple-system,sans-serif}
        #tmtt-fab{position:fixed;z-index:2147483000;right:18px;bottom:calc(22px + env(safe-area-inset-bottom));width:${state.ui.fabSize}px;height:${state.ui.fabSize}px;border:0;border-radius:50%;background:var(--accent);color:white;box-shadow:0 5px 20px #0003;font-size:21px;cursor:pointer}
        #tmtt-overlay{position:fixed;inset:0;z-index:2147483001;background:#0008;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box}
        #tmtt-panel{width:min(980px,100%);height:min(820px,94dvh);background:var(--bg);border:1px solid var(--line);border-radius:18px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 18px 60px #0005}
        #tmtt-head{display:flex;align-items:center;gap:10px;padding:15px 18px;background:var(--panel);border-bottom:1px solid var(--line)}
        #tmtt-head strong{font-size:16px;letter-spacing:.02em} #tmtt-head small{color:var(--muted);margin-left:4px}
        #tmtt-close{margin-left:auto;border:0;background:transparent;color:var(--muted);font-size:22px;padding:2px 8px}
        #tmtt-toolbar{display:flex;gap:8px;align-items:center;padding:12px 15px;flex-wrap:wrap}
        #tmtt-search{flex:1;min-width:150px} #tmtt-root input,#tmtt-root select{background:var(--input);color:var(--text);border:1px solid var(--line);border-radius:9px;padding:9px 11px;min-height:38px;box-sizing:border-box}
        .tmtt-btn{border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:9px;padding:8px 12px;cursor:pointer}
        .tmtt-btn.primary{background:var(--accent);border-color:var(--accent);color:white}
        #tmtt-grid{padding:2px 15px 18px;overflow:auto;display:grid;grid-template-columns:repeat(${state.ui.columns},minmax(0,1fr));gap:11px;align-content:start}
        .tmtt-card{background:var(--card);border:1px solid var(--line);border-radius:13px;min-width:0;padding:13px;display:flex;flex-direction:column;gap:8px}
        .tmtt-card.active{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
        .tmtt-card-title{font-weight:650;overflow-wrap:anywhere}
        .tmtt-card-sub{font-size:12px;color:var(--muted);min-height:18px}
        .tmtt-card-foot{display:flex;align-items:center;gap:6px;margin-top:auto}
        .tmtt-card-foot .tmtt-btn{font-size:12px;padding:6px 9px}
        .tmtt-card-foot .primary{margin-left:auto}
        #tmtt-settings{padding:16px;overflow:auto;display:grid;gap:14px}
        .tmtt-setting{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
        .tmtt-setting label{font-weight:600}
        #tmtt-toast{position:fixed;z-index:2147483002;left:50%;bottom:30px;transform:translate(-50%,15px);opacity:0;pointer-events:none;background:#292832;color:#fff;padding:10px 15px;border-radius:10px;transition:.2s;max-width:85vw}
        #tmtt-toast.show{opacity:1;transform:translate(-50%,0)} #tmtt-toast.bad{background:#9d3434}
        .tmtt-empty{grid-column:1/-1;text-align:center;color:var(--muted);padding:35px 10px}
        @media(max-width:560px){#tmtt-panel{height:calc(100dvh - 12px);border-radius:14px}#tmtt-grid{grid-template-columns:repeat(1,minmax(0,1fr))}}
        `;
    }
    function ensureUI() {
        if ($('#tmtt-root')) return;
        const style = document.createElement('style'); style.id='tmtt-style'; style.textContent=styleText(); document.head.append(style);
        const root = document.createElement('div'); root.id='tmtt-root'; document.body.append(root);
        root.innerHTML = `<button id="tmtt-fab" title="美化管理器">✿</button><div id="tmtt-toast"></div>`;
        $('#tmtt-fab',root).addEventListener('click', open);
    }
    function render() {
        if (!state.open) return;
        const overlay = $('#tmtt-overlay'); if (!overlay) return;
        const grid = $('#tmtt-grid');
        const list = filtered();
        grid.innerHTML = list.length ? list.map(t => {
            const m=state.meta[t.name]||{}, active=currentTheme()===t.name;
            const tags=(m.tags||[]).slice(0,3).map(x=>'<span>'+esc(x)+'</span>').join(' ');
            return `<article class="tmtt-card ${active?'active':''}">
                <div class="tmtt-card-title">${esc(t.name)}</div>
                <div class="tmtt-card-sub">${esc(m.author||'')} ${m.category?'· '+esc(m.category):''}</div>
                <div class="tmtt-card-sub">${esc(m.description||tags||'未添加备注')}</div>
                <div class="tmtt-card-foot"><button class="tmtt-btn" data-edit="${esc(t.name)}">标注</button><button class="tmtt-btn primary" data-apply="${esc(t.name)}" ${state.busy?'disabled':''}>${active?'当前使用':(state.busy?'切换中…':'应用美化')}</button></div>
            </article>`;
        }).join('') : '<div class="tmtt-empty">没有找到美化。请确认 TT 中已经导入主题。</div>';
        $('#tmtt-count').textContent = `${state.themes.length} 个主题`;
        const cat = $('#tmtt-category');
        if (cat) {
            const wanted=state.category;
            cat.innerHTML=categories().map(c=>`<option value="${esc(c)}">${c==='__all__'?'全部分类':esc(c)}</option>`).join('');
            cat.value=wanted;
        }
        $('#tmtt-grid').hidden = $('#tmtt-settings').hidden;
    }
    async function editMeta(name) {
        const old=state.meta[name]||{};
        const category=prompt('分类名称（留空=未分类）',old.category||'');
        if(category===null)return;
        const author=prompt('作者',old.author||'');
        if(author===null)return;
        const description=prompt('备注',old.description||'');
        if(description===null)return;
        const tags=prompt('标签（用逗号分隔）',(old.tags||[]).join(','));
        if(tags===null)return;
        state.meta[name]={...old,category:category.trim(),author:author.trim(),description:description.trim(),tags:tags.split(',').map(x=>x.trim()).filter(Boolean)};
        await dbPut('themeMeta',state.meta); render();
    }
    function open() {
        if (state.open) return;
        state.open=true;
        const root=$('#tmtt-root');
        const overlay=document.createElement('div'); overlay.id='tmtt-overlay';
        overlay.innerHTML=`<section id="tmtt-panel" role="dialog" aria-modal="true">
            <header id="tmtt-head"><strong>美化管理</strong><small id="tmtt-count"></small><button id="tmtt-close" aria-label="关闭">×</button></header>
            <div id="tmtt-toolbar"><input id="tmtt-search" placeholder="搜索美化名称、作者、标签…"><select id="tmtt-category"></select><button class="tmtt-btn" id="tmtt-refresh">刷新列表</button><button class="tmtt-btn" id="tmtt-open-settings">界面设置</button></div>
            <div id="tmtt-grid"></div>
            <div id="tmtt-settings" hidden>
              <div class="tmtt-setting"><label>管理器外观</label><select id="tmtt-mode"><option value="light">浅色</option><option value="dark">深色</option></select></div>
              <div class="tmtt-setting"><label>强调色</label><input id="tmtt-accent" type="color"></div>
              <div class="tmtt-setting"><label>卡片列数</label><select id="tmtt-columns"><option value="1">1 列</option><option value="2">2 列</option><option value="3">3 列</option></select></div>
              <div class="tmtt-setting"><label>悬浮球大小</label><input id="tmtt-fabsize" type="range" min="36" max="64"></div>
              <div class="tmtt-setting"><span>以上设置只影响管理器，不跟随酒馆外观。</span><button class="tmtt-btn primary" id="tmtt-back">返回美化列表</button></div>
            </div>
        </section>`;
        root.append(overlay);
        $('#tmtt-close').onclick=close;
        overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
        $('#tmtt-search').oninput=e=>{state.query=e.target.value;render();};
        $('#tmtt-category').onchange=e=>{state.category=e.target.value;render();};
        $('#tmtt-refresh').onclick=()=>refresh(true);
        $('#tmtt-open-settings').onclick=()=>{$('#tmtt-grid').hidden=true;$('#tmtt-settings').hidden=false;};
        $('#tmtt-back').onclick=()=>{$('#tmtt-settings').hidden=true;$('#tmtt-grid').hidden=false;};
        $('#tmtt-mode').value=state.ui.mode; $('#tmtt-accent').value=state.ui.accent;
        $('#tmtt-columns').value=String(state.ui.columns); $('#tmtt-fabsize').value=String(state.ui.fabSize);
        $('#tmtt-mode').onchange=e=>{state.ui.mode=e.target.value;saveUi();};
        $('#tmtt-accent').oninput=e=>{state.ui.accent=e.target.value;saveUi();};
        $('#tmtt-columns').onchange=e=>{state.ui.columns=Number(e.target.value);saveUi();};
        $('#tmtt-fabsize').oninput=e=>{state.ui.fabSize=Number(e.target.value);saveUi();};
        overlay.addEventListener('click',async e=>{
            const apply=e.target.closest('[data-apply]'), edit=e.target.closest('[data-edit]');
            try { if(apply) await applyTheme(apply.dataset.apply); if(edit) await editMeta(edit.dataset.edit); }
            catch(err){console.error(err);toast(err.message||String(err),true);}
        });
        render();
    }
    function close(){ $('#tmtt-overlay')?.remove(); state.open=false; }
    async function saveUi(){
        await dbPut('ui',state.ui);
        const st=$('#tmtt-style'); if(st) st.textContent=styleText();
        render();
    }
    async function refresh(showToast=false) {
        try {
            const list=await readThemes();
            state.themes=list;
            if(showToast) toast('已重新读取 '+list.length+' 个主题');
            render();
        } catch(err) {
            console.error('[TM-TT试用版] 读取主题失败',err);
            toast(err.message||String(err),true);
        }
    }
    async function start(){
        try {
            state.db=await openDb();
            state.meta=await dbGet('themeMeta')||{};
            state.ui={...state.ui,...(await dbGet('ui')||{})};
            ensureUI();
            const st=$('#tmtt-style'); if(st) st.textContent=styleText();
            await refresh(false);
            log('已启动。当前主题：',currentTheme());
        } catch(err) {
            console.error('[TM-TT试用版] 启动失败',err);
        }
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
    else start();
})();