function settingsTabs(active){return `<div class="settings-tabs"><a href="#account" class="${active==='account'?'active':''}">${icon('user')} الحساب والأمان</a><a href="#ai" class="${active==='ai'?'active':''}">${icon('spark')} ربط الذكاء الاصطناعي</a></div>`;}
const MODEL_SUGGESTIONS={
  openai:['gpt-4.1-mini','gpt-4o-mini','gpt-4.1','gpt-4o'],
  gemini:['gemini-2.0-flash','gemini-1.5-flash','gemini-2.0-flash-lite','gemini-1.5-pro'],
};
function renderAISettings(config){
  let provider=config.provider;
  $('#main').innerHTML=heading('ربط الذكاء الاصطناعي.', 'اختر المزوّد، ألصق مفتاح الاتصال، ثم احفظ واختبر.')+settingsTabs('ai')+`<div class="ai-intro"><span class="ai-intro-mark">✳</span><div><span class="eyebrow">إعداد الاتصال</span><h2>أدخل مفتاح API من هنا مباشرة.</h2><p>إذا ظهر في الشات «لم يُعثر على النموذج» فمعرّف النموذج غير صحيح لحسابك. اختر اقتراحًا أدناه أو انسخ الاسم من لوحة المزوّد.</p></div></div><form id="ai-form"><div class="provider-grid"><label class="provider-card"><input type="radio" name="provider" value="local"><span class="provider-symbol local-symbol">⌂</span><strong>الوضع الأساسي</strong><small>بدون مزوّد خارجي</small><p>ردود من المعرفة والقواعد المعتمدة داخل النظام.</p></label><label class="provider-card"><input type="radio" name="provider" value="openai"><span class="provider-symbol openai-symbol">◎</span><strong>OpenAI / GPT</strong><small>Responses API</small><p>ألصق مفتاح OpenAI ومعرّف النموذج المتاح في حسابك.</p></label><label class="provider-card"><input type="radio" name="provider" value="gemini"><span class="provider-symbol gemini-symbol">✦</span><strong>Google Gemini</strong><small>Gemini API</small><p>ألصق مفتاح Gemini ومعرّف النموذج المفعّل لحسابك.</p></label></div><div class="detail-grid ai-settings-grid"><section class="panel settings-form"><div class="section-title-row"><h2>مفتاح الاتصال والإعدادات</h2><span class="status-pill" id="provider-state"></span></div><div id="external-fields"><label>معرّف النموذج<input name="model" dir="ltr" maxlength="120" list="model-suggestions" placeholder="مثال: gpt-4.1-mini أو gemini-2.0-flash" autocomplete="off"><datalist id="model-suggestions"></datalist><span class="field-help" id="model-help">اكتب معرّف النموذج كما يظهر في حساب المزوّد.</span><div class="filter-chips" id="model-chips" style="margin-top:10px"></div></label><label>مفتاح الاتصال (API Key)<div class="password-wrap"><input name="api_key" type="password" dir="ltr" maxlength="2048" autocomplete="off" placeholder="ألصق مفتاح الاتصال هنا ثم احفظ"><button type="button" id="toggle-api-key" aria-label="إظهار مفتاح API">إظهار</button></div><span class="field-help" id="key-hint"></span></label><label class="inline-check"><input type="checkbox" name="clear_key">استبدال المفتاح المحفوظ (يلزم إدخال مفتاح جديد، ما لم يوجد مفتاح بيئة)</label><div id="last-test" class="test-result"></div></div><div class="notice" id="local-description">الوضع الأساسي لا يحتاج مفتاحًا. اختر GPT أو Gemini أعلاه لإظهار حقل مفتاح الاتصال.</div><label>الحد الأقصى لرموز الرد<input type="number" name="max_tokens" min="256" max="4096" step="1" required value="${config.max_tokens}"><span class="field-help">من ٢٥٦ إلى ٤٠٩٦. زيادة الحد قد تزيد زمن الاستجابة والتكلفة.</span></label><label>توجيه إضافي للأسلوب (اختياري)<textarea name="guidance" rows="3" maxlength="2000" placeholder="مثل: استخدم لغة بسيطة واذكر خطوات الإجابة…">${esc(config.guidance)}</textarea></label><div class="button-row"><button class="primary-button" type="submit">حفظ المفتاح وتفعيل الإعدادات ${icon('arrow')}</button><button class="outline-button compact" type="button" id="test-ai">اختبار الاتصال المحفوظ ${icon('spark')}</button></div><p class="form-error" role="alert"></p><div id="connection-result" role="status" aria-live="polite"></div></section><aside class="panel detail-aside"><span class="support-icon">${icon('shield')}</span><h3>خطوات سريعة</h3><p>١) اختر OpenAI أو Gemini.</p><p>٢) اختر معرّف نموذج صحيح (مثل gpt-4.1-mini).</p><p>٣) ألصق مفتاح الاتصال ثم احفظ.</p><p>٤) اضغط اختبار الاتصال قبل استخدام الشات.</p><a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" class="external-doc-link">مفاتيح OpenAI ↗</a><a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer" class="external-doc-link">مفاتيح Gemini ↗</a><button id="disconnect-ai" type="button" class="text-button danger-button">إزالة مفتاح المزوّد وإيقاف ربطه</button><p class="field-help">إذا كان المفتاح مضبوطًا كمتغير بيئة، يلزم إزالته من إعدادات تشغيل الخادم أيضًا.</p></aside></div></form>`;
  const form=$('#ai-form');
  function fillSuggestions(p){
    const list=MODEL_SUGGESTIONS[p]||[];
    $('#model-suggestions').innerHTML=list.map(m=>`<option value="${esc(m)}"></option>`).join('');
    $('#model-chips').innerHTML=list.map(m=>`<button type="button" data-model="${esc(m)}">${esc(m)}</button>`).join('');
    $('#model-help').textContent=p==='openai'
      ?'لـ OpenAI استخدم معرّفًا مثل gpt-4.1-mini أو gpt-4o-mini (وليس كلمة ChatGPT).'
      :p==='gemini'
      ?'لـ Gemini استخدم معرّفًا مثل gemini-2.0-flash بدون بادئة models/.'
      :'اكتب معرّف النموذج كما يظهر في حساب المزوّد.';
  }
  function select(p){
    provider=p;
    $$('input[name=provider]').forEach(el=>{el.checked=el.value===p;});
    const external=p!=='local',settings=config.providers[p];
    $('#external-fields').hidden=!external;$('#local-description').hidden=external;$('#disconnect-ai').hidden=!external;
    form.elements.model.required=external;
    const saved=settings?.model||'';
    form.elements.model.value=saved||(MODEL_SUGGESTIONS[p]?.[0]||'');
    form.elements.api_key.value='';form.elements.clear_key.checked=false;
    $('#provider-state').textContent=p===config.provider?'المزوّد النشط':'غير مفعّل بعد';
    $('#key-hint').textContent=settings?.has_key?(settings.key_from_environment?'يوجد مفتاح من متغيرات بيئة الخادم. اترك الحقل فارغًا للاحتفاظ به، أو ألصق مفتاحًا جديدًا لاستبداله.':'يوجد مفتاح محفوظ. اترك الحقل فارغًا للاحتفاظ به، أو ألصق مفتاحًا جديدًا لاستبداله.'):'لم يُضبط مفتاح بعد. ألصق مفتاح الاتصال هنا ثم احفظ.';
    $('#last-test').textContent=settings?.tested_at?`${settings.test_ok?'نجح آخر اختبار':'فشل آخر اختبار'} · ${date(settings.tested_at)}`:'لم يُختبر هذا الربط بعد.';
    $('#connection-result').textContent='';
    fillSuggestions(p);
  }
  select(provider);
  $$('input[name=provider]').forEach(el=>el.onchange=()=>select(el.value));
  $('#model-chips').onclick=e=>{const b=e.target.closest('[data-model]');if(!b)return;form.elements.model.value=b.dataset.model;form.elements.model.focus();};
  $('#toggle-api-key').onclick=()=>{const input=form.elements.api_key;input.type=input.type==='password'?'text':'password';$('#toggle-api-key').textContent=input.type==='password'?'إظهار':'إخفاء';};
  form.onsubmit=async e=>{e.preventDefault();const b=$('button[type=submit]',form);b.disabled=true;$('.form-error',form).textContent='';try{await post('/api/staff/ai',{provider,model:form.elements.model.value.trim(),api_key:form.elements.api_key.value.trim(),clear_key:form.elements.clear_key.checked,max_tokens:Number(form.elements.max_tokens.value),guidance:form.elements.guidance.value});form.elements.api_key.value='';await navigate();toast('تم حفظ المفتاح وتفعيل الإعدادات. اختبر الاتصال قبل استخدام الشات.');}catch(err){$('.form-error',form).textContent=err.message;}finally{b.disabled=false;}};
  $('#test-ai').onclick=async()=>{const b=$('#test-ai');b.disabled=true;$('#connection-result').className='test-result';$('#connection-result').textContent='جارٍ اختبار الإعدادات المحفوظة، قد يستغرق حتى ٤٥ ثانية…';try{const result=await post('/api/staff/ai/test',{});$('#connection-result').className='test-result success';$('#connection-result').textContent=`${result.message} زمن الاستجابة: ${ar(result.latency_ms)} مللي ثانية.`;}catch(err){$('#connection-result').className='test-result error';$('#connection-result').textContent=err.message;}finally{b.disabled=false;}};
  $('#disconnect-ai').onclick=async()=>{const b=$('#disconnect-ai');b.disabled=true;try{await post('/api/staff/ai/disconnect',{provider});await navigate();toast('تمت إزالة المفتاح المحفوظ وإيقاف الربط لهذا المزوّد.');}catch(e){toast(e.message);}finally{b.disabled=false;}};
}
