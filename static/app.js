const $ = (s, root = document) => root.querySelector(s);
const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ar = n => Number(n).toLocaleString('ar-SA');
let state = { conversations: [], tickets: [], questions: 0 };
let conversationId = null, messages = [], sending = false, routeVersion = 0;
const services = [
  {title:'القبول والتسجيل', desc:'كل ما يخص بداية رحلتك الجامعية', detail:'استفسارات التقديم والقبول وإجراءات التسجيل والمواعيد.', icon:'cap', question:'ما شروط القبول والتسجيل في الكلية؟'},
  {title:'الخطط الدراسية', desc:'تعرّف على مسارك الأكاديمي', detail:'استفسارات البرامج والمقررات والخطط الدراسية.', icon:'book', question:'كيف يمكنني الاطلاع على الخطة الدراسية؟'},
  {title:'التدريب التعاوني', desc:'خطوتك الأولى نحو سوق العمل', detail:'استفسارات متطلبات التدريب وإجراءاته وجهاته.', icon:'user', question:'ما متطلبات التدريب التعاوني؟'},
  {title:'الخدمات الإلكترونية', desc:'خدماتك الرقمية في مكان واحد', detail:'استفسارات الوصول إلى الخدمات والأنظمة الجامعية.', icon:'grid', question:'كيف أصل إلى الخدمات الإلكترونية؟'},
  {title:'متطلبات التخرج', desc:'اقترب أكثر من يوم إنجازك', detail:'استفسارات استكمال الدراسة وإجراءات التخرج.', icon:'cap', question:'ما متطلبات التخرج من الكلية؟'},
  {title:'اللوائح والأنظمة', desc:'معلومات تساعدك على اتخاذ القرار', detail:'استفسارات الأنظمة الأكاديمية والإجراءات واللوائح.', icon:'shield', question:'أين أجد اللوائح والأنظمة الأكاديمية؟'}
];
const faq = ['ما شروط القبول في الكلية التطبيقية؟', 'كيف أطلع على خطتي الدراسية؟', 'ما متطلبات التدريب التعاوني؟', 'كيف أستفيد من الخدمات الإلكترونية؟'];
const pageTitles = {home:'نظرة عامة',chat:'المساعد الذكي',history:'محادثاتي',tickets:'طلباتي',services:'دليل الخدمات',about:'عن مُعين'};

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: {'Content-Type':'application/json', 'X-CSRF-Token':$('meta[name="csrf-token"]').content, ...(options.headers || {})} });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'تعذر إتمام العملية، حاول مرة أخرى.');
  return data;
}
async function refreshState() {
  state = await api('/api/state');
  $('#ticket-count').textContent = ar(state.tickets.length);
  if(typeof applyPreferences==='function')applyPreferences();
}
let toastTimer;
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4000); }
function serviceCards(full = false) {
  return `<div class="service-grid">${services.map((s,i) => `<a href="#service/${i}" class="service-card"><span class="corner-arrow">↖</span><span class="service-icon">${icon(s.icon)}</span><h3>${s.title}</h3><p>${full ? s.detail : s.desc}</p></a>`).join('')}</div>`;
}
function activityRows(list) {
  return `<div class="activity">${list.map(c => `<a href="#chat/${c.id}" class="activity-row">${icon('chat')}<div><strong>${esc(c.title)}</strong><small>${formatDate(c.created)}</small></div><span class="status-pill">عرض المحادثة</span></a>`).join('')}</div>`;
}
function formatDate(value) { const d = new Date(value.replace(' ', 'T') + 'Z'); return new Intl.DateTimeFormat('ar-SA', {day:'numeric', month:'long', calendar:'gregory'}).format(d); }
function heading(title, desc, action = '') { return `<div class="page-heading"><div><h1>${title}</h1><p>${desc}</p></div>${action}</div>`; }
function renderHome() {
  const date = new Intl.DateTimeFormat('ar-SA',{weekday:'long',day:'numeric',month:'long',year:'numeric',calendar:'gregory',timeZone:'Asia/Riyadh'}).format(new Date());
  $('#main').innerHTML = `<div class="welcome-row"><div><span class="eyebrow">مساحتك الجامعية، بكل بساطة</span><h1>أهلًا بك، كيف نقدر نساعدك؟ <span class="wave">✦</span></h1><p>إجابات أقرب، وخدمات أوضح. ابدأ رحلتك مع مُعين.</p></div><span class="date-pill">${icon('clock')}${date}</span></div>
  <div class="dashboard-grid"><div class="main-stack">
    <section class="hero"><div class="hero-content"><span class="hero-label">${icon('spark')} مساعدك في رحلتك الجامعية</span><h2>سؤالك هو البداية،<br><span>ومُعين يسهّل عليك الباقي.</span></h2><p>استكشف خدمات الكلية، اطرح استفسارك، واعرف الخطوة التالية في مكان واحد.</p><button class="primary-button" data-new-chat>ابدأ محادثة الآن ${icon('arrow')}</button></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="orbit two"></div><div class="orbit three"></div><div class="flower">${Array.from({length:8},(_,i)=>`<span class="petal" style="transform:rotate(${i*45}deg)"></span>`).join('')}</div><span class="hero-star">✧</span><span class="hero-star second">✦</span><span class="hero-speck"></span></div></section>
    <div class="stat-grid"><div class="stat-card"><span class="stat-icon">${icon('chat')}</span><div><strong>${ar(state.conversations.length)}</strong><small>محادثاتك</small></div></div><div class="stat-card"><span class="stat-icon">${icon('ticket')}</span><div><strong>${ar(state.tickets.length)}</strong><small>طلباتك المسجّلة</small></div></div><div class="stat-card"><span class="stat-icon">${icon('grid')}</span><div><strong>٦</strong><small>مجالات الخدمات</small></div></div></div>
    <div class="section-heading"><h2>كيف نقدر نخدمك؟</h2><a href="#services">جميع الخدمات ${icon('arrow')}</a></div>${serviceCards()}
    <div class="section-heading"><h2>محادثاتك الأخيرة</h2><a href="#history">عرض الكل ${icon('arrow')}</a></div>${state.conversations.length ? activityRows(state.conversations.slice(0,2)) : `<div class="activity empty-inline">${icon('chat')} محادثتك الأولى تبدأ بسؤال.<a href="#chat">ابدأ الآن ←</a></div>`}
  </div><div class="right-stack"><section class="panel"><h2 class="panel-title">${icon('spark')} أسئلة قد تدور في بالك</h2><p class="panel-intro">اختر سؤالًا وابدأ الحديث مع مُعين</p><div class="faq-list">${faq.map(q=>`<button class="faq-button" data-question="${esc(q)}">${q}${icon('arrow')}</button>`).join('')}</div></section><section class="panel support-panel"><span class="support-icon">${icon('user')}</span><h3>تحتاج مساعدة إضافية؟</h3><p>ما لقيت المعلومة اللي تبحث عنها؟<br>سجّل استفسارك لمتابعته في طلباتك.</p><button class="outline-button" data-ticket>إنشاء طلب مساعدة ${icon('arrow')}</button></section><div class="trust-strip">${icon('shield')}<span>مساحة محلية تحترم خصوصيتك.<br>نسخة أكاديمية تجريبية، والمعلومات الرسمية لم تُضف بعد.</span></div></div></div>`;
}
function renderServices() {
  $('#main').innerHTML = `<div class="services-page">${heading('كل خدماتك، أقرب إليك.', 'استكشف المجالات التي صُمّم مُعين لمساعدتك فيها.')}<label class="search-box">${icon('search')}<input id="service-search" aria-label="البحث في الخدمات" placeholder="ابحث عن خدمة…"></label><div id="service-results">${serviceCards(true)}</div><p class="notice">هذه تصنيفات للخدمات المقترحة في تقرير المشروع. الإجابة عن الإجراءات والمواعيد تتطلب إضافة مصادر رسمية معتمدة.</p></div>`;
  $('#service-search').addEventListener('input', e => {
    const q = e.target.value.trim();
    $$('.service-card').forEach((el,i) => el.hidden = !(services[i].title + services[i].detail).includes(q));
    let noResults = $('#no-results');
    if (!noResults) { noResults = document.createElement('p'); noResults.id='no-results'; noResults.className='notice'; $('#service-results').append(noResults); }
    noResults.textContent = 'لا توجد خدمة مطابقة. جرّب كلمة أخرى.';
    noResults.hidden = services.some(s => (s.title+s.detail).includes(q));
  });
}
function $$(selector) { return [...document.querySelectorAll(selector)]; }
function renderHistory() {
  $('#main').innerHTML = heading('كل سؤال، وله حكاية.', 'ارجع إلى محادثاتك وأكمل من حيث توقفت.', `<button class="primary-button" data-new-chat>${icon('plus')} محادثة جديدة</button>`) + (state.conversations.length ? `<label class="search-box">${icon('search')}<input id="history-search" aria-label="البحث في المحادثات" placeholder="ابحث في محادثاتك…"></label><div id="history-list">${activityRows(state.conversations)}</div>` : `<section class="empty-state">${icon('chat')}<h2>مساحتك جاهزة لأول سؤال</h2><p>ستظهر محادثاتك هنا تلقائيًا، لتعود إليها متى احتجت.</p><button class="primary-button" data-new-chat>ابدأ محادثة ${icon('arrow')}</button></section>`);
  $('#history-search')?.addEventListener('input', e => { const filtered=state.conversations.filter(c=>c.title.includes(e.target.value.trim())); $('#history-list').innerHTML = filtered.length ? activityRows(filtered) : '<p class="notice">لا توجد محادثات مطابقة.</p>'; });
}
function renderTickets() {
  $('#main').innerHTML = heading('طلباتك، في مكان واحد.', 'أنشئ طلبًا واحتفظ بتفاصيله للرجوع إليها.', `<button class="primary-button" data-ticket>${icon('plus')} طلب جديد</button>`) + `<div class="notice">الطلبات محفوظة على هذا الجهاز فقط. بوابة الموظف والإرسال الفعلي قيد التطوير.</div>` + (state.tickets.length ? `<div class="ticket-list">${state.tickets.map(t=>`<article class="ticket-card"><div class="ticket-top"><span class="eyebrow">طلب #${ar(t.id)}</span><span class="status-pill">${esc(t.status)} · محفوظ محليًا</span></div><h3>${esc(t.subject)}</h3><p>${esc(t.details)}</p><div class="ticket-meta"><span>${esc(t.category)}</span><span>${formatDate(t.created)}</span></div></article>`).join('')}</div>` : `<section class="empty-state">${icon('ticket')}<h2>لا توجد طلبات حتى الآن</h2><p>إذا لم تجد إجابة كافية، سجّل استفسارك هنا. لا تحتاج لإدخال بيانات شخصية.</p><button class="primary-button" data-ticket>إنشاء أول طلب ${icon('arrow')}</button></section>`);
}
function renderAbout() {
  $('#main').innerHTML = heading('مُعين، رفيق تجربتك الجامعية.', 'مساعد ذكاء اصطناعي لخدمة المستفيدين — مشروع تخرج أكاديمي.') + `<div class="about-grid"><article>${icon('spark')}<h2>فكرة المشروع</h2><p>واجهة عربية لخدمة طلاب الكلية التطبيقية بشرورة بجامعة نجران وأعضاء هيئة التدريس والزوار، تسهّل الوصول إلى المعلومات وتربط الاستفسار بمصدره.</p></article><article>${icon('shield')}<h2>خصوصيتك أولًا</h2><p>تعمل هذه النسخة محليًا. تُحفظ محادثاتك وطلباتك في قاعدة بيانات على الجهاز، ويربطها المتصفح بمعرّف جلسة. لا تشارك بيانات حساسة أو كلمات مرور. استخدام جهاز أو متصفح آخر لا يعرض سجل هذه الجلسة.</p></article><article>${icon('book')}<h2>المعلومة تبدأ من مصدر</h2><p>المصدر المتاح حاليًا هو تقرير المشروع، وليس لوائح الجامعة. لا يقدّم مُعين تخمينات عن المواعيد أو شروط القبول أو المتطلبات الأكاديمية. تُعرض رسالة واضحة عندما لا تتوفر المعلومة.</p></article><article>${icon('grid')}<h2>ما المتاح الآن؟</h2><p>واجهات متجاوبة، حفظ المحادثات، تقييم الردود، تسجيل الطلبات ودليل مجالات الخدمات. الردود الحالية محدودة ومحكومة بقواعد ثابتة. ربط النموذج المحلي والبحث الدلالي وقاعدة المعرفة الرسمية وبوابة الموظف مراحل لاحقة.</p></article></div>`;
}
function renderChat() {
  $('#main').innerHTML = `<div class="chat-layout"><div class="chat-heading"><div><h1>${icon('spark')} المساعد الذكي</h1><p>مساحة لسؤالك، وخطوة أقرب للمعلومة.</p></div><button data-new-chat>＋ محادثة جديدة</button></div><div id="chat-content"></div><div class="chat-form-wrap"><form id="chat-form" class="chat-form"><textarea id="question" rows="1" maxlength="2000" aria-label="سؤالك للمساعد" placeholder="اكتب سؤالك هنا…" required></textarea><button type="submit" aria-label="إرسال السؤال" ${sending?'disabled':''}>${icon('arrow')}</button></form><p class="chat-disclaimer">نسخة تجريبية بردود محدودة · لم يُربط النموذج المحلي بعد · لا تُدخل بيانات حساسة</p></div></div>`;
  renderMessages();
  if(typeof applyChatMode==='function')applyChatMode();
  $('#chat-form').addEventListener('submit', e => { e.preventDefault(); sendQuestion($('#question').value); });
  $('#question').addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#chat-form').requestSubmit();} });
}
function renderMessages() {
  if (!$('#chat-content')) return;
  $('#chat-content').innerHTML = messages.length ? `<div class="messages">${messages.map(m=>`<article class="message ${m.role}"><span class="message-avatar">${m.role==='user'?'ز':'✳'}</span><div class="message-body"><span class="message-name">${m.role==='user'?'أنت':'مُعين'}</span><div class="bubble">${esc(m.content)}</div>${m.source?`<div class="source">${icon('book')}${esc(m.source)}</div>`:''}${m.role==='assistant'?`<div class="message-tools"><span>هل كان الرد مفيدًا؟</span><button class="${m.feedback===1?'selected':''}" data-feedback="${m.id}" data-value="1" aria-label="رد مفيد">نعم</button><button class="${m.feedback===-1?'selected':''}" data-feedback="${m.id}" data-value="-1" aria-label="رد غير مفيد">لا</button>${!m.source?'<button data-ticket>طلب مساعدة</button>':''}</div>`:''}</div></article>`).join('')}${sending?'<div class="typing" role="status">مُعين يجهّز الرد…</div>':''}</div>` : `<div class="chat-welcome"><div class="big-mark">✳</div><span class="eyebrow">أهلًا بك في مُعين</span><h2>كيف أقدر أساعدك اليوم؟</h2><p>ابدأ بسؤالك، أو اختر أحد الاقتراحات التالية.</p><div class="chat-suggestions">${['ما فكرة المشروع؟','كيف تحافظون على خصوصية بياناتي؟',faq[0],faq[2]].map(q=>`<button data-question="${esc(q)}">${q}<span>↖</span></button>`).join('')}</div></div>`;
}
async function sendQuestion(text) {
  if (sending || !text.trim()) return;
  if(state.ai?.external&&!$('#cloud-consent')?.checked)return toast('وافق على إرسال السؤال إلى المزوّد الموضّح في تنبيه المحادثة أولًا.');
  const q = text.trim();
  if (q.length > 2000) return toast('السؤال أطول من الحد المسموح.');
  const version = routeVersion;
  messages.push({role:'user',content:q});
  sending = true;
  $('#question').value = '';
  $('#chat-form button').disabled = true;
  renderMessages();
  try {
    const consent=state.ai?.external&&$('#cloud-consent')?.checked?state.ai.consent_id:null;
    const result = await api('/api/chat', {method:'POST',body:JSON.stringify({question:q,conversation_id:conversationId,cloud_consent:consent})});
    if (routeVersion === version) { conversationId=result.conversation_id; messages.push(result.message); history.replaceState(null,'',`#chat/${conversationId}`); }
    await refreshState();
  } catch(e) {
    if(routeVersion===version){messages.pop();if($('#question'))$('#question').value=q;}
    toast(e.message);
  } finally {
    sending=false;
    if(routeVersion===version){renderMessages();if($('#chat-form button'))$('#chat-form button').disabled=false;$('#question')?.focus();$('#chat-form')?.scrollIntoView({block:'nearest',behavior:'smooth'});}
  }
}
async function navigate() {
  const version = ++routeVersion;
  try{await refreshState();}catch(e){toast(e.message);return;}
  if(version!==routeVersion)return;
  const [requested, cid] = (location.hash.slice(1) || 'home').split('/');
  const page = pageTitles[requested] ? requested : 'home';
  $('#sidebar').classList.remove('open');$('#shade').classList.remove('visible');$('#menu').setAttribute('aria-expanded','false');
  $('#page-label').textContent=pageTitles[page];
  $$('[data-nav]').forEach(el=>{ el.classList.toggle('active',el.dataset.nav===page);if(el.dataset.nav===page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current'); });
  if(page==='chat') {
    if(sending){toast('انتظر اكتمال الرد قبل فتح محادثة أخرى.'); return;}
    conversationId=null;messages=[];
    if(cid && /^\d+$/.test(cid)) {
      try {const data=await api(`/api/conversations/${cid}`);if(version!==routeVersion)return;conversationId=Number(cid);messages=data.messages;}catch(e){toast(e.message);}
    }
    if(version!==routeVersion)return;
    renderChat();
  } else if(['knowledge','article','notifications','settings','service','ticket'].includes(page)) {
    await renderExtras(page,cid,version);
  } else ({home:renderHome,services:renderServices,history:renderHistory,tickets:renderTickets,about:renderAbout}[page])();
  window.scrollTo(0,0);
}
async function newChat(question) {
  if(sending) return toast('انتظر حتى يكتمل الرد الحالي.');
  history.pushState(null,'','#chat');
  await navigate();
  if(question && $('#question')){$('#question').value=question;$('#question').focus();}
}
document.addEventListener('click', async e => {
  if(e.target.closest('[data-new-chat]')) return newChat();
  const service=e.target.closest('[data-service]');if(service)return newChat(services[Number(service.dataset.service)].question);
  const question=e.target.closest('[data-question]');if(question)return newChat(question.dataset.question);
  if(e.target.closest('[data-ticket]')){
    const form=$('#ticket-form');form.reset();$('.form-error',form).textContent='';
    const latest=[...messages].reverse().find(m=>m.role==='user');
    if(latest){form.elements.subject.value=latest.content.slice(0,120);form.elements.details.value=latest.content;}
    $('#ticket-dialog').showModal();return;
  }
  if(e.target.closest('.close-dialog'))return $('#ticket-dialog').close();
  const feedback=e.target.closest('[data-feedback]');
  if(feedback){
    try{const id=Number(feedback.dataset.feedback),value=Number(feedback.dataset.value);await api('/api/feedback',{method:'POST',body:JSON.stringify({message_id:id,value})});const m=messages.find(m=>m.id===id);if(m)m.feedback=value;renderMessages();toast('شكرًا لك، تم حفظ تقييمك.');}catch(err){toast(err.message);}
  }
});
$('#ticket-form').addEventListener('submit', async e=>{
  e.preventDefault();const form=e.target,button=$('button[type="submit"]',form);button.disabled=true;
  try{const data=Object.fromEntries(new FormData(form));const result=await api('/api/tickets',{method:'POST',body:JSON.stringify(data)});await refreshState();$('#ticket-dialog').close();history.pushState(null,'','#tickets');await navigate();toast(`تم حفظ طلبك رقم ${ar(result.id)} محليًا.`);}catch(err){$('.form-error',form).textContent=err.message;}finally{button.disabled=false;}
});
$('#menu').addEventListener('click',()=>{const open=$('#sidebar').classList.toggle('open');$('#shade').classList.toggle('visible',open);$('#menu').setAttribute('aria-expanded',String(open));});
$('#shade').addEventListener('click',()=>{$('#sidebar').classList.remove('open');$('#shade').classList.remove('visible');$('#menu').setAttribute('aria-expanded','false');});
$('#help-button').addEventListener('click',()=>location.hash='about');
window.addEventListener('hashchange',navigate);
window.addEventListener('DOMContentLoaded',async()=>{try{await navigate();}catch(e){$('#main').innerHTML='<section class="empty-state"><h2>تعذر تحميل المساحة</h2><p>تحقق من تشغيل الخادم ثم أعد تحميل الصفحة.</p></section>';toast(e.message);}});
