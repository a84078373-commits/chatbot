import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
temporary=tempfile.TemporaryDirectory(prefix='mueen-test-')
os.environ['ASSISTANT_DB']=str(Path(temporary.name)/'test.db')
os.environ['AI_ENCRYPTION_KEY_FILE']=str(Path(temporary.name)/'key')
from app import app, db, ai, ai_attempts, login_attempts, student_attempts, seed_demo_accounts
import requests

class BackendTests(unittest.TestCase):
    def setUp(self):
        app.config['TESTING']=True
        self.env=patch.dict(os.environ,{'OPENAI_API_KEY':'','GEMINI_API_KEY':'','ALLOW_REMOTE_STAFF_SETUP':''})
        self.env.start()
        self.addCleanup(self.env.stop)
        with db() as c:
            for table in ['notifications','ticket_replies']:
                c.execute(f'DELETE FROM {table}')
            for table in ['messages','tickets','conversations','staff','accounts','preferences']:
                c.execute(f'DELETE FROM {table}')
            c.execute("DELETE FROM knowledge WHERE source='test-source'")
            c.execute("UPDATE ai_config SET provider='local',revision=1,guidance='',max_tokens=2048")
            c.execute("UPDATE ai_providers SET model='',secret='',test_ok=NULL,tested_at=NULL")
        ai_attempts.clear();login_attempts.clear();student_attempts.clear()
        self.visitor=app.test_client();self.other=app.test_client();self.staff=app.test_client()
        self.vh=self.headers(self.visitor);self.oh=self.headers(self.other);self.sh=self.headers(self.staff)

    def headers(self,client):
        html=client.get('/').get_data(as_text=True)
        return {'X-CSRF-Token':re.search(r'name="csrf-token" content="([^"]+)"',html).group(1)}

    def setup_staff(self):
        response=self.staff.post('/api/staff/setup',json={'username':'qa-staff','name':'موظف الاختبار','password':'only-for-tests-123'},headers=self.sh)
        self.assertEqual(response.status_code,201)
        self.sh['X-CSRF-Token']=response.json['csrf']

    def enable(self,provider='openai'):
        response=self.staff.post('/api/staff/ai',json={'provider':provider,'model':'example-test-model','api_key':'fake-test-key-not-a-real-credential','max_tokens':2048,'guidance':''},headers=self.sh)
        self.assertEqual(response.status_code,200,response.json)

    @staticmethod
    def response(provider='openai',answer=None):
        text=json.dumps(answer or {'answer':'إجابة مستندة إلى المصدر','source_ids':[3],'abstain':False},ensure_ascii=False)
        body={'status':'completed','output':[{'type':'reasoning','summary':[]},{'type':'message','content':[{'type':'output_text','text':text}]}]} if provider=='openai' else {'candidates':[{'finishReason':'STOP','content':{'parts':[{'thought':True,'text':'private thought'},{'text':text}]}}]}
        return Mock(status_code=200,json=Mock(return_value=body))

    def test_authorization_csrf_and_initial_setup(self):
        self.assertEqual(self.visitor.get('/api/staff/dashboard').status_code,401)
        self.assertEqual(self.visitor.get('/api/staff/ai').status_code,401)
        self.assertEqual(self.visitor.post('/api/chat',json={'question':'test'}).status_code,403)
        self.assertEqual(self.staff.post('/api/staff/setup',json={},headers=self.sh,environ_overrides={'REMOTE_ADDR':'192.168.1.2'}).status_code,403)
        self.setup_staff()
        self.assertEqual(self.other.post('/api/staff/setup',json={'username':'second','name':'test','password':'long-password'},headers=self.oh).status_code,409)
        with db() as c:
            self.assertNotIn('only-for-tests',c.execute('SELECT password_hash FROM staff').fetchone()[0])
        self.assertEqual(self.staff.post('/api/staff/logout',json={},headers=self.sh).status_code,200)
        self.assertEqual(self.staff.get('/api/staff/knowledge').status_code,401)
        self.assertEqual(self.staff.post('/api/staff/login',json={'username':'qa-staff','password':'wrong'},headers=self.sh).status_code,401)
        self.assertEqual(self.staff.post('/api/staff/login',json={'username':'qa-staff','password':'only-for-tests-123'},headers=self.sh).status_code,200)

    def test_ticket_reply_notification_isolation(self):
        self.setup_staff()
        tid=self.visitor.post('/api/tickets',json={'subject':'استفسار','category':'عام','details':'أحتاج مساعدة'},headers=self.vh).json['id']
        result=self.staff.post(f'/api/staff/tickets/{tid}',json={'status':'مكتمل','reply':'تمت مراجعة الاستفسار'},headers=self.sh)
        self.assertEqual(result.status_code,200)
        detail=self.visitor.get(f'/api/tickets/{tid}').json
        self.assertEqual(detail['ticket']['status'],'مكتمل')
        self.assertEqual(detail['replies'][0]['content'],'تمت مراجعة الاستفسار')
        self.assertEqual(self.other.get(f'/api/tickets/{tid}').status_code,404)
        self.assertEqual(len(self.visitor.get('/api/state').json['notifications']),1)
        self.assertEqual(self.other.get('/api/state').json['notifications'],[])
        self.visitor.post('/api/notifications/read',json={},headers=self.vh)
        self.assertEqual(self.visitor.get('/api/state').json['notifications'][0]['is_read'],1)
        self.assertEqual(self.staff.get('/api/staff/dashboard').json['closed'],1)

    def test_draft_publish_edit_and_preferences(self):
        self.setup_staff()
        data={'title':'مقالة','question':'سؤال تجريبي','category':'عام','content':'محتوى للاختبار','source':'test-source','status':'draft'}
        data['id']=self.staff.post('/api/staff/knowledge',json=data,headers=self.sh).json['id']
        self.assertNotIn(data['id'],[a['id'] for a in self.visitor.get('/api/state').json['knowledge']])
        data['status']='published'
        self.assertEqual(self.staff.post('/api/staff/knowledge',json=data,headers=self.sh).status_code,200)
        article=next(a for a in self.visitor.get('/api/state').json['knowledge'] if a['id']==data['id'])
        self.assertEqual(article['version'],2)
        self.assertEqual(self.visitor.post('/api/preferences',json={'name':'سارة','audience':'زائر','theme':'dark'},headers=self.vh).status_code,200)
        self.assertEqual(self.visitor.get('/api/state').json['preferences']['theme'],'dark')
        self.assertEqual(self.other.get('/api/state').json['preferences']['theme'],'light')

    def test_roles_admin_student_visitor(self):
        self.assertEqual(self.visitor.get('/api/state').json['auth']['role'],'visitor')
        self.assertEqual(self.visitor.post('/api/auth/register',json={'username':'student1','name':'طالب','password':'student-pass-123'},headers=self.vh).status_code,201)
        state=self.visitor.get('/api/state').json
        self.assertEqual(state['auth']['role'],'student')
        self.assertEqual(state['preferences']['audience'],'طالب')
        self.assertEqual(self.visitor.post('/api/preferences',json={'name':'طالب محدث','audience':'طالب','theme':'light'},headers=self.vh).status_code,200)
        self.assertEqual(self.visitor.get('/api/staff/ai').status_code,401)
        self.setup_staff()
        session=self.staff.get('/api/staff/session').json
        self.assertEqual(session['user']['role'],'admin')
        self.assertEqual(self.staff.get('/api/staff/ai').status_code,200)
        self.assertEqual(self.visitor.post('/api/auth/logout',json={},headers=self.vh).status_code,200)
        self.assertEqual(self.visitor.get('/api/state').json['auth']['role'],'visitor')

    def test_demo_accounts_saved_in_database(self):
        seed_demo_accounts()
        demo=self.visitor.get('/api/auth/demo').json
        self.assertTrue(demo['enabled'])
        with db() as c:
            self.assertEqual(c.execute("SELECT role FROM staff WHERE username='admin'").fetchone()[0],'admin')
            self.assertEqual(c.execute("SELECT role FROM accounts WHERE username='student'").fetchone()[0],'student')
            admin_hash=c.execute("SELECT password_hash FROM staff WHERE username='admin'").fetchone()[0]
        self.assertNotEqual(admin_hash,'demo-admin-123')
        self.assertEqual(self.staff.post('/api/staff/login',json={'username':'admin','password':'demo-admin-123'},headers=self.sh).status_code,200)
        self.assertEqual(self.visitor.post('/api/auth/login',json={'username':'student','password':'demo-student-123'},headers=self.vh).status_code,200)
        seed_demo_accounts()
        with db() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM staff WHERE username='admin'").fetchone()[0],1)
            self.assertEqual(c.execute("SELECT COUNT(*) FROM accounts WHERE username='student'").fetchone()[0],1)

    def test_credentials_encrypted_masked_and_disable(self):
        self.setup_staff();self.enable()
        with db() as c:
            secret=c.execute("SELECT secret FROM ai_providers WHERE provider='openai'").fetchone()[0]
        self.assertNotIn('fake-test-key',secret)
        self.assertNotIn('fake-test-key',json.dumps(self.staff.get('/api/staff/ai').json))
        self.assertNotIn('secret',json.dumps(self.visitor.get('/api/state').json))
        response=self.staff.post('/api/staff/ai',json={'provider':'openai','model':'new-model','api_key':'','max_tokens':1024},headers=self.sh)
        self.assertEqual(response.status_code,200)
        self.assertTrue(ai.settings()['providers']['openai']['has_key'])
        self.assertEqual(self.staff.post('/api/staff/ai/disconnect',json={'provider':'openai'},headers=self.sh).status_code,200)
        self.assertEqual(ai.public()['provider'],'local')
        self.assertFalse(ai.settings()['providers']['openai']['has_key'])

    @patch('ai_service.requests.post')
    def test_gpt_generation_grounding_consent_and_retention(self,send):
        self.setup_staff();self.enable();send.return_value=self.response()
        self.assertEqual(self.visitor.post('/api/chat',json={'question':'خصوصية بياناتي'},headers=self.vh).status_code,409)
        self.assertFalse(send.called)
        result=self.visitor.post('/api/chat',json={'question':'خصوصية بياناتي','cloud_consent':ai.public()['consent_id']},headers=self.vh)
        self.assertEqual(result.status_code,200,result.json)
        self.assertIn('خصوصية',result.json['message']['source'])
        self.assertFalse(send.call_args.kwargs['json']['store'])
        self.assertFalse(send.call_args.kwargs['allow_redirects'])
        self.assertNotIn('fake-test-key',json.dumps(send.call_args.kwargs['json']))
        cid=result.json['conversation_id']
        self.assertEqual(self.other.get(f'/api/conversations/{cid}').status_code,404)
        self.staff.post('/api/staff/ai',json={'provider':'local'},headers=self.sh)
        self.enable('gemini')
        self.assertEqual(self.visitor.post('/api/chat',json={'question':'سؤال','cloud_consent':'openai:2'},headers=self.vh).status_code,409)

    @patch('ai_service.requests.post')
    def test_gemini_adapter_and_test_connection(self,send):
        self.setup_staff();self.enable('gemini');send.return_value=self.response('gemini')
        result=self.staff.post('/api/staff/ai/test',json={},headers=self.sh)
        self.assertEqual(result.status_code,200)
        self.assertIn('x-goog-api-key',send.call_args.kwargs['headers'])
        self.assertNotIn('key=',send.call_args.args[0])
        self.assertIn('systemInstruction',send.call_args.kwargs['json'])
        self.assertEqual(ai.settings()['providers']['gemini']['test_ok'],1)
        result=self.visitor.post('/api/chat',json={'question':'خصوصية بياناتي','cloud_consent':ai.public()['consent_id']},headers=self.vh)
        self.assertEqual(result.status_code,200,result.json)
        self.assertNotIn('private thought',result.json['message']['content'])

    @patch('ai_service.requests.post')
    def test_failures_do_not_leak_or_save_partial_chat(self,send):
        self.setup_staff();self.enable()
        send.return_value=Mock(status_code=401,text='private-secret-error')
        result=self.visitor.post('/api/chat',json={'question':'اختبار','cloud_consent':ai.public()['consent_id']},headers=self.vh)
        self.assertEqual(result.status_code,502)
        self.assertNotIn('private-secret',result.get_data(as_text=True))
        self.assertEqual(self.visitor.get('/api/state').json['conversations'],[])
        send.side_effect=requests.Timeout()
        self.assertEqual(self.staff.post('/api/staff/ai/test',json={},headers=self.sh).status_code,502)
        send.side_effect=None;send.return_value=self.response(answer={'answer':'غير موثق','source_ids':[99999],'abstain':False})
        result=self.visitor.post('/api/chat',json={'question':'اختبار','cloud_consent':ai.public()['consent_id']},headers=self.vh)
        self.assertEqual(result.status_code,502)

    def test_validation_account_and_expiry(self):
        self.setup_staff()
        self.assertEqual(self.visitor.post('/api/chat',json=['bad'],headers=self.vh).status_code,400)
        self.assertEqual(self.staff.post('/api/staff/ai',json={'provider':'openai','model':'https://evil.test','api_key':'key'},headers=self.sh).status_code,400)
        self.assertEqual(self.staff.post('/api/staff/account',json={'name':'اسم جديد','current_password':'only-for-tests-123','new_password':'new-test-password-456'},headers=self.sh).status_code,200)
        with self.staff.session_transaction() as s:s['staff_active']=1
        self.assertEqual(self.staff.get('/api/staff/ai').status_code,401)

if __name__=='__main__':
    unittest.main(verbosity=2)
