const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {randomBytes}=require('node:crypto');
(async()=>{
  const temp=mkdtempSync(join(tmpdir(),'mueen-qa-'));
  const server=spawn('python',['app.py'],{env:{...process.env,PORT:'5011',ASSISTANT_DB:join(temp,'qa.db'),AI_ENCRYPTION_KEY_FILE:join(temp,'key'),OPENAI_API_KEY:'',GEMINI_API_KEY:''},windowsHide:true,stdio:'ignore'});
  let browser;
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,1800);server.once('error',e=>{clearTimeout(timer);reject(e);});});
    browser=await chromium.launch({channel:'msedge',headless:true});
    const vctx=await browser.newContext({viewport:{width:1440,height:1050}}),sctx=await browser.newContext({viewport:{width:1440,height:1050}});
    const visitor=await vctx.newPage(),staff=await sctx.newPage();
    const errors=[];for(const page of [visitor,staff])page.on('pageerror',e=>errors.push(e.message));
    const base='http://127.0.0.1:5011';
    await visitor.goto(base);await visitor.locator('.hero').waitFor();
    await visitor.locator('a[data-nav=services]').click();await visitor.locator('.service-card').first().click();await visitor.locator('.service-detail-hero').waitFor();
    await visitor.locator('[data-service-ticket]').click();await visitor.locator('#ticket-form input[name=subject]').fill('استفسار عن التسجيل');await visitor.locator('#ticket-form textarea').fill('أحتاج معرفة المصدر المعتمد لإجراءات التسجيل.');await visitor.locator('#ticket-form button[type=submit]').click();await visitor.locator('.ticket-card').waitFor();
    await staff.goto(base+'/staff/');await staff.locator('#auth-form').waitFor();
    await staff.locator('input[name=name]').fill('موظف التجربة');await staff.locator('input[name=username]').fill('qa-staff');
    const password=randomBytes(18).toString('base64url');await staff.locator('input[name=password]').fill(password);await staff.locator('input[name=confirm]').fill(password);await staff.locator('.auth-submit').click();await staff.locator('.staff-welcome').waitFor();
    await staff.locator('a[data-nav=tickets]').click();await staff.locator('.table-subject').first().click();await staff.locator('#reply-form').waitFor();await staff.locator('#reply-form select[name=status]').selectOption({label:'مكتمل'});await staff.locator('textarea[name=reply]').fill('تمت مراجعة استفسارك. يرجى إرفاق الوثيقة المعتمدة لنوضح الإجراء بناءً عليها.');await staff.locator('#reply-form button[type=submit]').click();await staff.locator('.staff-reply').waitFor();
    await visitor.locator('a[data-nav=notifications]').click();await visitor.locator('.notification-item.unread').waitFor();await visitor.locator('.notification-item').first().click();await visitor.locator('.staff-reply').waitFor();
    await visitor.screenshot({path:'output/ticket-reply.png',fullPage:true});
    await staff.locator('a[data-nav=knowledge]').click();await staff.locator('#add-article').click();
    const form=staff.locator('#article-form');for(const [k,v] of Object.entries({title:'دليل تجريبي للمراجعة',category:'دليل الاستخدام',question:'كيف أراجع طلبي؟',content:'افتح طلباتي ثم اختر الطلب لقراءة الرد وحالة المعالجة.',source:'دليل الاستخدام التجريبي'}))await form.locator(`[name=${k}]`).fill(v);
    await form.locator('button[type=submit]').click();await staff.locator('#article-dialog').waitFor({state:'hidden'});await staff.locator('.article-card').filter({hasText:'دليل تجريبي للمراجعة'}).waitFor();
    await visitor.locator('a[data-nav=knowledge]').click();await visitor.locator('#knowledge-search').fill('دليل تجريبي للمراجعة');if(await visitor.locator('.article-card').count())throw Error('Draft visible publicly');
    await staff.locator('.article-card').filter({hasText:'دليل تجريبي للمراجعة'}).getByRole('button',{name:'تعديل'}).click();await form.locator('[name=status]').selectOption('published');await form.locator('button[type=submit]').click();await staff.locator('#article-dialog').waitFor({state:'hidden'});
    await visitor.reload();await visitor.locator('#knowledge-search').fill('دليل تجريبي');await visitor.locator('.article-card').first().click();await visitor.locator('.reading-card').waitFor();
    await staff.locator('a[data-nav=ai]').click();await staff.locator('#ai-form').waitFor();await staff.locator('input[name=provider][value=openai]').check();await staff.locator('input[name=model]').fill('example-test-model');await staff.locator('input[name=api_key]').fill('fake-key-for-ui-tests-only');await staff.locator('#ai-form button[type=submit]').click();await staff.locator('#key-hint').filter({hasText:'يوجد مفتاح محفوظ'}).waitFor();
    const model=await staff.locator('input[name=api_key]').inputValue();if(model)throw Error('Secret returned to UI');
    await staff.route('**/api/staff/ai/test',route=>route.fulfill({json:{ok:true,message:'اختبار واجهة محاكى — دون اتصال خارجي.',latency_ms:12}}));await staff.locator('#test-ai').click();await staff.locator('#connection-result.success').waitFor();
    await staff.screenshot({path:'output/ai-settings-desktop.png',fullPage:true});
    await visitor.locator('a[data-nav=chat]').click();await visitor.locator('#cloud-consent').waitFor();if(await visitor.locator('#cloud-consent').isChecked())throw Error('Cloud consent preselected');
    await visitor.locator('#question').fill('اختبار');await visitor.locator('#chat-form button').click();await visitor.locator('#toast').filter({hasText:'وافق'}).waitFor();if(await visitor.locator('.message.user').count())throw Error('Sent without consent');
    await staff.locator('input[name=provider][value=local]').check();await staff.locator('#ai-form button[type=submit]').click();await staff.locator('#local-description').waitFor({state:'visible'});
    await visitor.reload();await visitor.locator('#question').fill('مرحبا');await visitor.locator('#chat-form button').click();await visitor.locator('.message.assistant').waitFor();
    await visitor.locator('a[data-nav=settings]').click();await visitor.locator('input[name=name]').fill('سارة');await visitor.locator('input[name=theme][value=dark]').check();await visitor.locator('#preferences-form button[type=submit]').click();await visitor.locator('body.dark').waitFor();await visitor.locator('a[data-nav=knowledge]').click();await visitor.locator('.article-card').first().waitFor();await visitor.screenshot({path:'output/knowledge-dark.png',fullPage:true});
    await staff.locator('a[data-nav=overview]').click();await staff.locator('.staff-welcome').waitFor();await staff.screenshot({path:'output/staff-dashboard.png',fullPage:true});
    await staff.locator('a[data-nav=reports]').click();await staff.locator('.categories-report').waitFor();const download=staff.waitForEvent('download');await staff.locator('#export-report').click();await download;
    for(const [page,hash] of [[visitor,'#tickets'],[staff,'#ai']]){
      await page.setViewportSize({width:390,height:844});await page.goto(base+(page===staff?'/staff/':'/')+hash);await page.locator(page===staff?'#ai-form':'.ticket-card').waitFor();if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile horizontal overflow');await page.screenshot({path:page===staff?'output/ai-settings-mobile.png':'output/tickets-mobile.png',fullPage:true});await page.locator('#menu').click();await page.locator('#sidebar.open').waitFor();await page.locator('a[data-nav=knowledge]').click();await page.locator(page===staff?'#knowledge-cards':'#article-results').waitFor();
    }
    await staff.setViewportSize({width:1440,height:1050});await staff.locator('#logout').click();await staff.locator('#auth-form').waitFor();await staff.screenshot({path:'output/staff-login.png',fullPage:true});await staff.locator('input[name=username]').fill('qa-staff');await staff.locator('input[name=password]').fill(password);await staff.locator('.auth-submit').click();await staff.locator('#staff-root').waitFor({state:'visible'});
    if(errors.length)throw Error(errors.join('\n'));
    console.log('PASS: local staff setup/login/logout; request/reply/notification; draft isolation/publication; AI settings and encrypted key UI; mocked connection UI; cloud consent; local chat; preferences/dark mode; reports export; desktop and mobile navigation; no page errors. No live AI calls made.');
  } finally {
    if(browser)await browser.close();server.kill();await new Promise(resolve=>server.once('exit',resolve));
    const target=join(temp);if(target.startsWith(join(tmpdir(),'mueen-qa-')))rmSync(target,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
