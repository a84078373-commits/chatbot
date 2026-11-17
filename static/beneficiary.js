Object.assign(pageTitles,{knowledge:'مركز المعرفة',article:'قراءة المقالة',notifications:'الإشعارات',settings:'إعدادات المساحة',service:'تفاصيل الخدمة',ticket:'تفاصيل الطلب'});
function applyPreferences(){
  const p=state.preferences||{name:'زائر',theme:'light'};
  document.body.classList.toggle('dark',p.theme==='dark');
  $$('.avatar').forEach(el=>el.textContent=p.name.slice(0,1));
  $('.profile>div').innerHTML=`أهلًا، ${esc(p.name)}<small>${esc(p.audience||'مساحة المستفيد')}</small>`;
  $('#notification-count').textContent=ar((state.notifications||[]).filter(n=>!n.is_read).length);
  if($('#chat-form'))applyChatMode();
}
const statusClass=s=>s==='مكتمل'?'green':s==='قيد المعالجة'?'amber':'purple';
const statusPill=s=>`<span class="status-pill ${statusClass(s)}">${esc(s)}</span>`;
function articleCards(articles){return articles.length?`<div class="article-grid">${articles.map(a=>`<a class="article-card" href="#article/${a.id}"><span class="article-category">${icon('book')}${esc(a.category)}</span><h3>${esc(a.title)}</h3><p>${esc(a.content.slice(0,125))}…</p><div class="article-foot"><span>قراءة المقالة</span><span>↖</span></div></a>`).join('')}</div>`:'<div class="empty-state"><h2>لا توجد مقالات مطابقة</h2><p>جرّب عبارة أقصر أو تصنيفًا آخر.</p></div>';}
function renderKnowledge(){
  $('#main').innerHTML=`${heading('معلومة واضحة، من مصدر معروف.', 'تصفّح الأدلة والمقالات المنشورة في مساحة المعرفة.')}<div class="knowledge-banner"><span class="banner-icon">${icon('book')}</span><div><span class="eyebrow">مكتبتك الصغيرة، لفهم أكبر</span><h2>خذ وقتك في الاستكشاف.</h2><p>أدلة الاستخدام متاحة الآن، وتُضاف المعلومات الجامعية بعد مراجعة مصادرها.</p></div><span class="banner-spark" aria-hidden="true">✳</span></div><label class="search-box">${icon('search')}<input id="knowledge-search" placeholder="ابحث في العناوين والأسئلة والمحتوى…" aria-label="البحث في المعرفة"></label><div class="filter-chips" id="knowledge-filters"><button class="active" data-category="">جميع المقالات</button>${[...new Set(state.knowledge.map(a=>a.category))].map(c=>`<button data-category="${esc(c)}">${esc(c)}</button>`).join('')}</div><div id="article-results">${articleCards(state.knowledge)}</div>`;
  let category='';
  const filter=()=>{const q=$('#knowledge-search').value.trim();$('#article-results').innerHTML=articleCards(state.knowledge.filter(a=>(!category||a.category===category)&&`${a.title} ${a.question} ${a.content}`.includes(q)));};
  $('#knowledge-search').addEventListener('input',filter);
  $('#knowledge-filters').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;category=b.dataset.category;$$('#knowledge-filters button').forEach(el=>el.classList.toggle('active',el===b));filter();});
}
function renderArticle(id){
  const a=state.knowledge.find(a=>a.id===Number(id));
  if(!a){$('#main').innerHTML=heading('المقالة غير متاحة','قد تكون مسودة أو أُزيلت من النشر.')+'<a class="outline-button compact" href="#knowledge">العودة إلى مركز المعرفة</a>';return;}
  $('#main').innerHTML=`<a class="back-link" href="#knowledge">→ مركز المعرفة</a><div class="detail-grid"><article class="reading-card"><span class="article-category">${esc(a.category)}</span><h1>${esc(a.title)}</h1><p class="article-question">${esc(a.question)}</p><div class="reading-content">${esc(a.content)}</div><div class="source-box">${icon('shield')}<div><strong>المصدر</strong><p>${esc(a.source)}</p><small>آخر مراجعة: ${formatDate(a.updated)} · الإصدار ${ar(a.version)}</small></div></div></article><aside class="panel detail-aside"><span class="support-icon">${icon('chat')}</span><h3>ما زال لديك سؤال؟</h3><p>شاركنا استفسارك لتعرف الخطوة التالية.</p><button class="outline-button" data-question="${esc(a.question)}">افتح المساعد ${icon('arrow')}</button><button class="text-button" data-ticket>إنشاء طلب مساعدة</button></aside></div>`;
}
function renderService(id){
  const s=/^\d+$/.test(id||'')?services[Number(id)]:null;
  if(!s){location.hash='services';return;}
  $('#main').innerHTML=`<a href="#services" class="back-link">→ دليل الخدمات</a><div class="service-detail-hero"><span class="service-icon">${icon(s.icon)}</span><span class="eyebrow">خدمات الكلية · ${ar(Number(id)+1)} / ٦</span><h1>${s.title}</h1><p>${s.detail}</p><div class="button-row"><button class="primary-button" data-question="${esc(s.question)}">اسأل مُعين ${icon('spark')}</button><button class="outline-button compact" data-service-ticket="${id}">إنشاء طلب للخدمة ${icon('arrow')}</button></div></div><div class="detail-grid"><section class="panel"><h2>كيف تستفيد من هذه المساحة؟</h2><div class="steps"><div><span>١</span><section><h3>ابدأ باستفسارك</h3><p>اكتب سؤالك بوضوح، دون إدخال بيانات حساسة.</p></section></div><div><span>٢</span><section><h3>تحقّق من المصدر</h3><p>المواعيد والشروط والإجراءات تعتمد على الوثائق المنشورة في مركز المعرفة.</p></section></div><div><span>٣</span><section><h3>تابع مع الموظف</h3><p>أنشئ طلبًا، ثم راجع الردود والحالة من مساحة طلباتك.</p></section></div></div></section><aside class="panel detail-aside"><h3>قبل أن تبدأ</h3><p>هذه مساحة استفسارات ومتابعة طلبات. لتنفيذ المعاملات الرسمية استخدم القنوات المعتمدة لدى الكلية عند الحاجة.</p><span class="status-pill green">خدمة المستفيدين متاحة</span></aside></div>`;
}
renderTickets=function(){
  const counts={all:state.tickets.length,open:state.tickets.filter(t=>t.status!=='مكتمل').length,closed:state.tickets.filter(t=>t.status==='مكتمل').length};
  $('#main').innerHTML=heading('طلباتك، وخطوتها التالية.', 'تابع حالة استفساراتك واقرأ ردود الموظف من هنا.',`<button class="primary-button" data-ticket>${icon('plus')} طلب جديد</button>`)+`<div class="filter-chips" id="ticket-filters"><button class="active" data-filter="all">الكل <span>${ar(counts.all)}</span></button><button data-filter="open">طلبات مفتوحة <span>${ar(counts.open)}</span></button><button data-filter="closed">طلبات مكتملة <span>${ar(counts.closed)}</span></button></div><div id="ticket-results"></div><p class="subtle-note">تُدار الطلبات عبر بوابة الموظف، وتظهر الردود والإشعارات هنا مباشرة.</p>`;
  const draw=filter=>{const list=state.tickets.filter(t=>filter==='all'||(filter==='closed'?t.status==='مكتمل':t.status!=='مكتمل'));$('#ticket-results').innerHTML=list.length?`<div class="ticket-list">${list.map(t=>`<a href="#ticket/${t.id}" class="ticket-card interactive-card"><div class="ticket-top"><span class="eyebrow">طلب #${ar(t.id)}</span>${statusPill(t.status)}</div><h3>${esc(t.subject)}</h3><p>${esc(t.details.slice(0,150))}</p><div class="ticket-meta"><span>${esc(t.category)}</span><span>${formatDate(t.created)}</span><span class="push-start">عرض التفاصيل ←</span></div></a>`).join('')}</div>`:`<section class="empty-state">${icon('ticket')}<h2>لا توجد طلبات في هذا القسم</h2><p>عند تسجيل طلب ستجد تفاصيله وحالته وردود الموظف هنا.</p><button class="primary-button" data-ticket>إنشاء طلب ${icon('plus')}</button></section>`;};draw('all');
  $('#ticket-filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;$$('#ticket-filters button').forEach(el=>el.classList.toggle('active',el===b));draw(b.dataset.filter);});
};
async function renderTicket(id,version){
  $('#main').innerHTML='<div class="loading-state">جارٍ تحميل تفاصيل الطلب…</div>';
  try{const data=await api(`/api/tickets/${Number(id)}`);if(version!==routeVersion)return;const t=data.ticket;
    $('#main').innerHTML=`<a href="#tickets" class="back-link">→ طلباتي</a>${heading(esc(t.subject),`طلب #${ar(t.id)} · ${formatDate(t.created)}`,statusPill(t.status))}<div class="detail-grid"><section class="panel"><div class="ticket-timeline"><article class="timeline-item"><span class="timeline-dot"></span><span class="eyebrow">استفسارك الأصلي</span><div class="reading-content">${esc(t.details)}</div></article>${data.replies.map(r=>`<article class="timeline-item staff-reply"><span class="timeline-dot"></span><div class="reply-heading"><strong>${esc(r.name)} <span class="tiny-badge">الموظف المختص</span></strong><small>${formatDate(r.created)}</small></div><div class="reading-content">${esc(r.content)}</div></article>`).join('')}${!data.replies.length?'<div class="waiting-reply">'+icon('clock')+' بانتظار رد الموظف. سيظهر الرد هنا ويصلك إشعار داخل المساحة.</div>':''}</div></section><aside class="panel detail-aside"><h3>معلومات الطلب</h3><dl class="meta-list"><dt>الخدمة</dt><dd>${esc(t.category)}</dd><dt>رقم الطلب</dt><dd>#${ar(t.id)}</dd><dt>الحالة الحالية</dt><dd>${statusPill(t.status)}</dd></dl><button class="outline-button" data-refresh-ticket="${t.id}">تحديث الحالة ${icon('clock')}</button></aside></div>`;
  }catch(e){if(version===routeVersion)$('#main').innerHTML=heading('تعذر عرض الطلب',esc(e.message));}
}
function renderNotifications(){
  const list=state.notifications||[];
  $('#main').innerHTML=heading('كل جديد، يصلك هنا.', 'تحديثات الطلبات وردود الموظف في مكان واحد.',list.some(n=>!n.is_read)?'<button class="outline-button compact" id="read-notifications">تعليم الكل كمقروء</button>':'')+(list.length?`<div class="notification-list">${list.map(n=>`<a class="notification-item ${n.is_read?'':'unread'}" href="#ticket/${n.ticket_id}"><span class="notification-icon">${icon('ticket')}</span><div><strong>${esc(n.text)}</strong><small>${formatDate(n.created)} · عرض الطلب</small></div>${!n.is_read?'<span class="unread-dot"></span>':''}<span>↖</span></a>`).join('')}</div>`:`<section class="empty-state">${icon('ticket')}<h2>أنت على اطّلاع بكل شيء</h2><p>عند وصول رد أو تحديث حالة طلبك، سيظهر إشعار هنا.</p><a class="primary-button" href="#tickets">استعرض طلباتك ${icon('arrow')}</a></section>`);
  $('#read-notifications')?.addEventListener('click',async()=>{try{await api('/api/notifications/read',{method:'POST',body:'{}'});await refreshState();renderNotifications();}catch(e){toast(e.message);}});
}
function renderSettings(){
  const p=state.preferences;
  $('#main').innerHTML=heading('مساحتك، على طريقتك.', 'اختيارات بسيطة تجعل التجربة أقرب لك.')+`<div class="detail-grid"><form id="preferences-form" class="panel settings-form"><h2>ملف المستفيد</h2><p class="subtle-note">حدّث اسم العرض وفئتك لتمييز مساحتك. حساب الموظف يُدار من بوابة الموظف.</p><label>اسم العرض<input name="name" required maxlength="50" value="${esc(p.name)}" autocomplete="nickname"></label><label>فئة المستفيد<select name="audience">${['زائر','طالب / طالبة','عضو هيئة تدريس'].map(s=>`<option ${p.audience===s?'selected':''}>${s}</option>`).join('')}</select></label><fieldset class="theme-field"><legend>مظهر المساحة</legend><div class="theme-options"><label><input type="radio" name="theme" value="light" ${p.theme==='light'?'checked':''}><span class="theme-swatch light-swatch">☀</span>فاتح</label><label><input type="radio" name="theme" value="dark" ${p.theme==='dark'?'checked':''}><span class="theme-swatch dark-swatch">☾</span>داكن</label></div></fieldset><button class="primary-button" type="submit">حفظ التفضيلات ${icon('arrow')}</button><p class="form-error" role="alert"></p></form><aside class="panel detail-aside"><span class="support-icon">${icon('shield')}</span><h3>حسابك في هذه المساحة</h3><p>تُحفظ تفضيلاتك ومحادثاتك وطلباتك بحسب جلستك. حسابات الموظفين منفصلة وتُنشأ من بوابة الموظف مع اسم مستخدم وكلمة مرور.</p><a href="#about" class="text-button">المزيد عن الخصوصية ←</a></aside></div>`;
  $('#preferences-form').addEventListener('submit',async e=>{e.preventDefault();const b=$('button[type=submit]',e.target);b.disabled=true;try{await api('/api/preferences',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});await refreshState();toast('تم حفظ تفضيلات مساحتك.');}catch(err){$('.form-error',e.target).textContent=err.message;}finally{b.disabled=false;}});
}
async function renderExtras(page,id,version){
  if(page==='ticket')return renderTicket(id,version);
  ({knowledge:renderKnowledge,article:()=>renderArticle(id),service:()=>renderService(id),notifications:renderNotifications,settings:renderSettings}[page])();
}
document.addEventListener('click',e=>{
  const ticket=e.target.closest('[data-service-ticket]');
  if(ticket){$('#ticket-form').reset();$('#ticket-form select').value=services[Number(ticket.dataset.serviceTicket)].title;$('#ticket-dialog').showModal();}
  if(e.target.closest('[data-refresh-ticket]'))navigate();
});
const oldRenderAbout=renderAbout;
renderAbout=function(){oldRenderAbout();const articles=$$('.about-grid article');articles[1].querySelector('p').textContent='تُحفظ السجلات في النظام وتُفصل حسب جلسة المتصفح. يستطيع الموظف المخوّل مراجعة الطلبات. عند تفعيل GPT أو Gemini تُرسل الأسئلة والسياق المحدود والمعرفة ذات الصلة إلى المزوّد بعد الموافقة داخل المحادثة. لا تشارك بيانات حساسة.';articles[3].querySelector('p').textContent='محادثات محفوظة، طلبات مرتبطة ببوابة الموظف، إشعارات، مركز معرفة، وتفضيلات. فعّل GPT أو Gemini وأدخل مفتاح الاتصال من إعدادات الموظف ثم اختبر الاتصال.';};
const baseRenderHome=renderHome;
renderHome=function(){baseRenderHome();const trust=$('.trust-strip span');trust.textContent=state.ai?.external?`المزوّد النشط: ${state.ai.label}. راجع تنبيه الإرسال في المحادثة قبل مشاركة أي سؤال.`:'الخدمة جاهزة. يمكن تفعيل GPT أو Gemini وإدخال مفتاح الاتصال من إعدادات الموظف.';const p=state.preferences;if(p?.name&&p.name!=='زائر')$('.welcome-row h1').textContent=`أهلًا ${p.name}، كيف نقدر نساعدك؟`;};
function applyChatMode(){
  const mode=state.ai||{external:false,label:'الوضع الأساسي'};
  let notice=$('#ai-chat-notice');
  if(!notice){notice=document.createElement('div');notice.id='ai-chat-notice';notice.className='ai-chat-notice';$('.chat-heading').after(notice);}
  const checked=(notice.dataset.consentId===mode.consent_id&&$('#cloud-consent')?.checked)||sessionStorage.getItem(`consent:${mode.consent_id}`)==='yes';
  notice.dataset.consentId=mode.consent_id;
  notice.innerHTML=mode.external?`<div class="cloud-label">${icon('spark')} ${esc(mode.label)} مفعّل</div><p>سيُرسل سؤالك وآخر ٤ رسائل والمقاطع المنشورة ذات الصلة إلى هذا المزوّد. لا تشارك بيانات حساسة.</p><label class="inline-check"><input type="checkbox" id="cloud-consent" ${checked?'checked':''}>أوافق على إرسال هذا السياق إلى ${esc(mode.label)} في هذه الجلسة.</label>`:`<div class="cloud-label">${icon('shield')} الوضع الأساسي مفعّل</div><p>الردود من المعرفة المنشورة والقواعد المعتمدة. فعّل مزوّدًا خارجيًا من إعدادات الموظف عند الحاجة.</p>`;
  $('#cloud-consent')?.addEventListener('change',e=>sessionStorage.setItem(`consent:${mode.consent_id}`,e.target.checked?'yes':'no'));
  $('.chat-disclaimer').textContent=mode.external?'قد يخطئ النموذج · تحقّق من المصادر · اطلب مراجعة الموظف عند الحاجة':'تحقّق من المصادر · اطلب مراجعة الموظف عند الحاجة · لا تُدخل بيانات حساسة';
}
document.addEventListener('visibilitychange',async()=>{if(!document.hidden){try{await refreshState();if(location.hash==='#notifications')renderNotifications();}catch{}}});
