"""Arabic beneficiary service with optional server-side GPT/Gemini connectors."""
import os
import secrets
import sqlite3
import time
import threading
from datetime import timedelta
from functools import wraps
from pathlib import Path
from flask import Flask, jsonify, render_template, request, session
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash
from ai_service import AIService, AIError

ROOT = Path(__file__).resolve().parent
app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
secret_path = ROOT / '.session-key'
if not secret_path.exists():
    secret_path.write_text(secrets.token_hex(32), encoding='utf-8')
app.secret_key = os.environ.get('SECRET_KEY') or secret_path.read_text(encoding='utf-8').strip()
_secure_cookies = os.environ.get('SESSION_COOKIE_SECURE', '').lower() in ('1', 'true', 'yes') or bool(os.environ.get('RENDER'))
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=_secure_cookies,
    MAX_CONTENT_LENGTH=65536,
)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)
DB = Path(os.environ.get('ASSISTANT_DB', ROOT / 'instance' / 'assistant.db'))
DB.parent.mkdir(exist_ok=True)

class ManagedConnection(sqlite3.Connection):
    def __exit__(self, *args):
        try:
            return super().__exit__(*args)
        finally:
            self.close()

def db():
    conn = sqlite3.connect(DB, factory=ManagedConnection, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    return conn

ROLES = {'admin': 'أدمن', 'student': 'طالب', 'visitor': 'زائر'}
AUDIENCES = {'visitor': 'زائر', 'student': 'طالب'}
DEMO_ACCOUNTS = [
    {'role': 'admin', 'username': 'admin', 'name': 'أدمن تجريبي', 'password': 'demo-admin-123'},
    {'role': 'student', 'username': 'student', 'name': 'طالب تجريبي', 'password': 'demo-student-123'},
]

def seed_demo_accounts():
    """Create experimental demo accounts once and keep them in the database."""
    if os.environ.get('SKIP_DEMO_ACCOUNTS', '').lower() in ('1', 'true', 'yes'):
        return
    with db() as conn:
        for account in DEMO_ACCOUNTS:
            username = account['username']
            password_hash = generate_password_hash(account['password'])
            if account['role'] == 'admin':
                if conn.execute('SELECT 1 FROM staff WHERE username=?', (username,)).fetchone():
                    continue
                conn.execute(
                    "INSERT INTO staff(username,name,password_hash,role) VALUES (?,?,?,'admin')",
                    (username, account['name'], password_hash),
                )
            else:
                if conn.execute('SELECT 1 FROM accounts WHERE username=?', (username,)).fetchone():
                    continue
                uid = conn.execute(
                    "INSERT INTO accounts(username,name,password_hash,role) VALUES (?,?,?,'student')",
                    (username, account['name'], password_hash),
                ).lastrowid
                owner = f'student:{uid}'
                conn.execute(
                    "INSERT OR IGNORE INTO preferences(owner,name,audience,theme) VALUES (?,?,?,?)",
                    (owner, account['name'], 'طالب', 'light'),
                )

with db() as conn:
    conn.executescript('''
    CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, conversation_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, source TEXT, feedback INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, subject TEXT NOT NULL, details TEXT NOT NULL, category TEXT NOT NULL, status TEXT DEFAULT 'جديد', created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS staff (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS ticket_replies (id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id), staff_id INTEGER NOT NULL REFERENCES staff(id), content TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS knowledge (id INTEGER PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, question TEXT NOT NULL, content TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', version INTEGER NOT NULL DEFAULT 1, updated TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS preferences (owner TEXT PRIMARY KEY, name TEXT DEFAULT 'زائر', audience TEXT DEFAULT 'زائر', theme TEXT DEFAULT 'light');
    CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, ticket_id INTEGER NOT NULL, text TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created TEXT DEFAULT CURRENT_TIMESTAMP);
    ''')
    staff_cols = {row[1] for row in conn.execute('PRAGMA table_info(staff)')}
    if 'role' not in staff_cols:
        conn.execute("ALTER TABLE staff ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'")
    conn.execute("UPDATE staff SET role='admin' WHERE role IS NULL OR role=''")
    conn.execute('CREATE INDEX IF NOT EXISTS idx_conversation_owner ON conversations(owner)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_ticket_owner ON tickets(owner)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_notification_owner ON notifications(owner)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username)')
    if not conn.execute('SELECT id FROM knowledge LIMIT 1').fetchone():
        conn.executemany('INSERT INTO knowledge(title,category,question,content,source,status) VALUES (?,?,?,?,?,?)', [
            ('كيف أستخدم مُعين؟', 'دليل الاستخدام', 'كيف أبدأ محادثة؟', 'افتح المساعد من القائمة ثم اكتب سؤالك واضغط الإرسال. تُحفظ محادثتك تلقائيًا في «محادثاتي». إذا فعّل الأدمن GPT أو Gemini، راجع تنبيه المزوّد ووافق على إرسال السياق قبل استخدام المحادثة.', 'دليل استخدام مُعين', 'published'),
            ('من السؤال إلى طلب المساعدة', 'دليل الاستخدام', 'كيف أتابع استفسارًا لا توجد له إجابة؟', 'من «طلباتي» أنشئ طلبًا وحدد الخدمة وأضف تفاصيل استفسارك. يرد الأدمن من بوابته ويغيّر الحالة. سيظهر الرد في تفاصيل طلبك ويصلك إشعار داخل الموقع.', 'دليل خدمة المستفيدين', 'published'),
            ('خصوصية المحادثات والطلبات', 'الخصوصية', 'أين تحفظ بياناتي؟', 'تُحفظ السجلات في النظام حسب دورك (زائر أو طالب). إعدادات الشات ومفاتيح API متاحة لدور الأدمن فقط. عند تفعيل GPT أو Gemini تُرسل الأسئلة والسياق بعد موافقتك. لا تشارك بيانات حساسة.', 'آلية عمل الخدمة وإعدادات المزوّد', 'published'),
            ('أدوار النظام', 'دليل الاستخدام', 'ما أدوار المستخدمين في مُعين؟', 'في النظام ثلاثة أدوار: الأدمن يدير الطلبات والمعرفة ويضبط مفتاح الذكاء الاصطناعي، والطالب يدخل بحسابه ويتابع محادثاته وطلباته، والزائر يستخدم الخدمة مباشرة دون تسجيل. توجد حسابات تجريبية محفوظة في قاعدة البيانات للتجربة.', 'دليل أدوار مُعين', 'published'),
        ])

seed_demo_accounts()

ai = AIService(db, os.environ.get('AI_ENCRYPTION_KEY_FILE', str(ROOT / '.ai-encryption-key')))
ai_slots = threading.BoundedSemaphore(2)
ai_attempts = {}
ai_attempt_lock = threading.Lock()

@app.errorhandler(413)
def too_large(_):
    return jsonify(error='حجم الطلب أكبر من المسموح. اختصر المحتوى وحاول مجددًا.'),413

def payload():
    value = request.get_json(silent=True)
    return value if isinstance(value, dict) else {}

def valid_text(data, key, limit, minimum=1):
    return isinstance(data.get(key), str) and minimum <= len(data[key].strip()) <= limit

def owner_key():
    return session['visitor']

def current_user_role():
    if session.get('staff_id') and time.time() - session.get('staff_active', 0) <= 1800:
        return 'admin'
    if session.get('account_id') and time.time() - session.get('account_active', 0) <= 1800:
        return 'student'
    return 'visitor'

def auth_payload():
    role = current_user_role()
    user = None
    if role == 'admin':
        with db() as conn:
            row = conn.execute('SELECT id,name,username,role FROM staff WHERE id=?', (session['staff_id'],)).fetchone()
            user = dict(row) if row else None
    elif role == 'student':
        with db() as conn:
            row = conn.execute('SELECT id,name,username,role FROM accounts WHERE id=?', (session['account_id'],)).fetchone()
            user = dict(row) if row else None
    return {'role': role, 'label': ROLES[role], 'user': user}

def staff_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if not session.get('staff_id') or time.time() - session.get('staff_active', 0) > 1800:
            session.pop('staff_id', None)
            session.pop('staff_active', None)
            return jsonify(error='سجّل دخولك إلى بوابة الأدمن أولًا.'), 401
        with db() as conn:
            row = conn.execute('SELECT role FROM staff WHERE id=?', (session['staff_id'],)).fetchone()
        if not row or row['role'] != 'admin':
            return jsonify(error='هذه العملية متاحة لدور الأدمن فقط.'), 403
        session['staff_active'] = time.time()
        return fn(*args, **kwargs)
    return wrapped

def admin_required(fn):
    return staff_required(fn)

@app.before_request
def visitor():
    if 'visitor' not in session:
        session['visitor'] = secrets.token_hex(24)
    if session.get('account_id') and time.time() - session.get('account_active', 0) > 1800:
        session.pop('account_id', None)
        session.pop('account_active', None)
        if str(session.get('visitor', '')).startswith('student:'):
            session['visitor'] = secrets.token_hex(24)
    if 'csrf' not in session:
        session['csrf'] = secrets.token_hex(24)
    if request.method == 'POST' and request.headers.get('X-CSRF-Token') != session['csrf']:
        return jsonify(error='انتهت الجلسة. أعد تحميل الصفحة وحاول مجددًا.'), 403

@app.get('/')
def index():
    return render_template('index.html', csrf=session['csrf'])

@app.get('/staff/')
@app.get('/admin/')
def staff_page():
    return render_template('staff.html', csrf=session['csrf'])

@app.get('/api/state')
def state():
    owner = owner_key()
    with db() as conn:
        conversations = [dict(r) for r in conn.execute('SELECT * FROM conversations WHERE owner=? ORDER BY id DESC', (owner,))]
        tickets = [dict(r) for r in conn.execute('SELECT * FROM tickets WHERE owner=? ORDER BY id DESC', (owner,))]
        count = conn.execute('SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.owner=? AND m.role=\'user\'', (owner,)).fetchone()[0]
        prefs = conn.execute('SELECT name,audience,theme FROM preferences WHERE owner=?', (owner,)).fetchone()
        notifications = [dict(r) for r in conn.execute('SELECT * FROM notifications WHERE owner=? ORDER BY id DESC LIMIT 100', (owner,))]
        knowledge = [dict(r) for r in conn.execute("SELECT * FROM knowledge WHERE status='published' ORDER BY updated DESC,id DESC")]
    role = current_user_role()
    default_prefs = {'name': AUDIENCES[role] if role in AUDIENCES else 'زائر', 'audience': AUDIENCES.get(role, 'زائر'), 'theme': 'light'}
    return jsonify(conversations=conversations, tickets=tickets, questions=count, preferences=dict(prefs) if prefs else default_prefs, notifications=notifications, knowledge=knowledge, ai=ai.public(), auth=auth_payload())

@app.get('/api/conversations/<int:cid>')
def history(cid):
    with db() as conn:
        if not conn.execute('SELECT id FROM conversations WHERE id=? AND owner=?', (cid, session['visitor'])).fetchone():
            return jsonify(error='المحادثة غير موجودة'), 404
        return jsonify(messages=[dict(r) for r in conn.execute('SELECT * FROM messages WHERE conversation_id=? ORDER BY id', (cid,))])

def answer(question):
    q = question.strip()
    source = 'دليل خدمة مُعين'
    if any(word in q for word in ['مرحبا', 'السلام عليكم', 'أهلا', 'اهلا']):
        return 'أهلًا بك! أنا مُعين، مساعد المستفيدين في الكلية التطبيقية بشرورة. أساعدك في استكشاف الخدمات وحفظ استفساراتك ومتابعة طلبات المساعدة مع الموظف المختص.', source
    if any(word in q for word in ['خصوصية', 'بياناتي', 'الخصوصية']):
        return 'تُحفظ محادثاتك وطلباتك في النظام وتُفصل حسب جلسة المتصفح. عند تفعيل خدمة ذكاء اصطناعي خارجية ستظهر تفاصيل الإرسال وموافقتك قبل استخدام المحادثة. يستطيع الموظف المخوّل مراجعة طلبات المساعدة. تجنّب مشاركة البيانات الحساسة.', 'آلية عمل الخدمة وإعدادات المزوّد'
    if any(word in q for word in ['عن المساعد', 'فكرة المشروع', 'ماذا تقدم', 'من أنت', 'من انت']):
        return 'مُعين مساعد عربي لخدمة مستفيدي الكلية التطبيقية بشرورة بجامعة نجران. يستهدف الطلاب وأعضاء هيئة التدريس والزوار، ويجمع بين قاعدة معرفة موثّقة ومساعد ذكي مع إحالة الأسئلة غير المتوفرة إلى الموظف المختص عبر الطلبات.', source
    return 'لا تتوفر لديّ وثيقة معتمدة كافية للإجابة عن هذا الاستفسار حاليًا، لذلك لن أخمّن المعلومة. يمكنك تسجيل طلب من «طلباتي» ليراجعه الموظف، ومتابعة الرد من تفاصيل الطلب والإشعارات.', None

@app.post('/api/chat')
def chat():
    data = payload()
    q = data.get('question', '')
    if not isinstance(q, str) or not 1 <= len(q.strip()) <= 2000:
        return jsonify(error='اكتب سؤالًا بين حرف واحد و٢٠٠٠ حرف.'), 400
    cid = data.get('conversation_id')
    with db() as conn:
        if cid is not None:
            if type(cid) is not int or not conn.execute('SELECT id FROM conversations WHERE id=? AND owner=?', (cid, session['visitor'])).fetchone():
                return jsonify(error='المحادثة غير موجودة'), 404
        previous=[dict(r) for r in conn.execute('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 4',(cid,))][::-1] if cid else []
    config=ai.config()
    if config['provider']!='local':
        if data.get('cloud_consent')!=f'{config["provider"]}:{config["revision"]}':
            return jsonify(error='راجع تنبيه المزوّد ووافق على إرسال السؤال قبل المتابعة. إذا تغيّرت الإعدادات حدّث الصفحة.'),409
        now=time.time()
        with ai_attempt_lock:
            attempts=[t for t in ai_attempts.get(session['visitor'],[]) if now-t<60]
            if len(attempts)>=15:return jsonify(error='وصلت إلى حد ١٥ سؤالًا في الدقيقة. انتظر قليلًا.'),429
            ai_attempts[session['visitor']]=attempts+[now]
        if not ai_slots.acquire(blocking=False):
            return jsonify(error='المساعد مشغول الآن. جرّب بعد لحظات.'),429
        try:
            reply,source=ai.generate(q.strip(),previous,config)
        except AIError as err:
            return jsonify(error=str(err)),502
        finally:
            ai_slots.release()
    else:
        reply,source=answer(q)
    with db() as conn:
        if cid is None:
            cid = conn.execute('INSERT INTO conversations(owner,title) VALUES (?,?)', (session['visitor'], q.strip()[:65])).lastrowid
        conn.execute('INSERT INTO messages(conversation_id,role,content) VALUES (?,?,?)', (cid, 'user', q.strip()))
        mid = conn.execute('INSERT INTO messages(conversation_id,role,content,source) VALUES (?,?,?,?)', (cid, 'assistant', reply, source)).lastrowid
    return jsonify(conversation_id=cid, message={'id': mid, 'role': 'assistant', 'content': reply, 'source': source})

@app.post('/api/feedback')
def feedback():
    data = payload()
    if type(data.get('value')) is not int or data['value'] not in [-1, 1] or type(data.get('message_id')) is not int:
        return jsonify(error='تقييم غير صالح'), 400
    with db() as conn:
        result = conn.execute('UPDATE messages SET feedback=? WHERE id=? AND role=\'assistant\' AND conversation_id IN (SELECT id FROM conversations WHERE owner=?)', (data['value'], data['message_id'], session['visitor']))
        if not result.rowcount:
            return jsonify(error='الرسالة غير موجودة'), 404
    return jsonify(ok=True)

@app.post('/api/tickets')
def tickets():
    data = payload()
    limits = {'subject': 120, 'details': 2000, 'category': 100}
    if any(not isinstance(data.get(k), str) or not 1 <= len(data[k].strip()) <= limit for k, limit in limits.items()):
        return jsonify(error='أكمل عنوان الطلب وتصنيفه وتفاصيله ضمن الحدود المسموحة.'), 400
    with db() as conn:
        tid = conn.execute('INSERT INTO tickets(owner,subject,details,category) VALUES (?,?,?,?)', (session['visitor'], data['subject'].strip(), data['details'].strip(), data['category'].strip())).lastrowid
    return jsonify(id=tid), 201

@app.get('/api/tickets/<int:tid>')
def ticket_detail(tid):
    with db() as conn:
        ticket = conn.execute('SELECT * FROM tickets WHERE id=? AND owner=?', (tid, session['visitor'])).fetchone()
        if not ticket:
            return jsonify(error='الطلب غير موجود.'), 404
        replies = [dict(r) for r in conn.execute('SELECT r.id,r.content,r.created,s.name FROM ticket_replies r JOIN staff s ON s.id=r.staff_id WHERE ticket_id=? ORDER BY r.id', (tid,))]
    return jsonify(ticket=dict(ticket), replies=replies)

@app.post('/api/preferences')
def preferences():
    data = payload()
    role = current_user_role()
    allowed = ['زائر'] if role == 'visitor' else ['طالب'] if role == 'student' else ['زائر', 'طالب']
    if not valid_text(data, 'name', 50) or data.get('audience') not in allowed or data.get('theme') not in ['light','dark']:
        return jsonify(error='راجع الاسم والدور والمظهر.'), 400
    with db() as conn:
        conn.execute('INSERT INTO preferences(owner,name,audience,theme) VALUES (?,?,?,?) ON CONFLICT(owner) DO UPDATE SET name=excluded.name,audience=excluded.audience,theme=excluded.theme', (owner_key(),data['name'].strip(),data['audience'],data['theme']))
    return jsonify(ok=True)

@app.post('/api/notifications/read')
def read_notifications():
    with db() as conn:
        conn.execute('UPDATE notifications SET is_read=1 WHERE owner=?', (owner_key(),))
    return jsonify(ok=True)

def start_staff_session(user_id):
    session.pop('account_id', None)
    session.pop('account_active', None)
    session['staff_id']=user_id
    session['staff_active']=time.time()
    session.setdefault('csrf',secrets.token_hex(24))
    session.permanent=True

def start_student_session(user_id, name):
    session.pop('staff_id', None)
    session.pop('staff_active', None)
    session['account_id'] = user_id
    session['account_active'] = time.time()
    session['visitor'] = f'student:{user_id}'
    session.setdefault('csrf', secrets.token_hex(24))
    session.permanent = True
    with db() as conn:
        conn.execute(
            "INSERT INTO preferences(owner,name,audience,theme) VALUES (?,?,?,?) ON CONFLICT(owner) DO UPDATE SET name=CASE WHEN preferences.name IN ('زائر','طالب') THEN excluded.name ELSE preferences.name END,audience=excluded.audience",
            (session['visitor'], name, 'طالب', 'light'),
        )

@app.get('/api/auth/session')
def auth_session():
    return jsonify(**auth_payload(), csrf=session['csrf'], roles=ROLES)

@app.get('/api/auth/demo')
def auth_demo():
    """Public demo credentials for experimental accounts stored in the database."""
    return jsonify(
        enabled=os.environ.get('SKIP_DEMO_ACCOUNTS', '').lower() not in ('1', 'true', 'yes'),
        accounts=[
            {
                'role': item['role'],
                'label': ROLES[item['role']],
                'username': item['username'],
                'password': item['password'],
                'name': item['name'],
                'portal': '/admin/' if item['role'] == 'admin' else '/',
            }
            for item in DEMO_ACCOUNTS
        ],
        visitor={'role': 'visitor', 'label': ROLES['visitor'], 'note': 'الزائر لا يحتاج حسابًا؛ تُحفظ جلسته وبياناته في قاعدة البيانات بمعرّف جلسة.'},
    )

student_attempts = {}
@app.post('/api/auth/register')
def student_register():
    data = payload()
    if not valid_text(data, 'username', 60, 3) or not valid_text(data, 'name', 60) or not valid_text(data, 'password', 128, 10):
        return jsonify(error='أدخل الاسم واسم مستخدم من ٣ أحرف وكلمة مرور من ١٠ أحرف على الأقل.'), 400
    username = data['username'].strip().lower()
    with db() as conn:
        if conn.execute('SELECT 1 FROM accounts WHERE username=?', (username,)).fetchone() or conn.execute('SELECT 1 FROM staff WHERE username=?', (username,)).fetchone():
            return jsonify(error='اسم المستخدم مستخدم مسبقًا.'), 409
        uid = conn.execute(
            "INSERT INTO accounts(username,name,password_hash,role) VALUES (?,?,?,'student')",
            (username, data['name'].strip(), generate_password_hash(data['password'])),
        ).lastrowid
    start_student_session(uid, data['name'].strip())
    return jsonify(ok=True, csrf=session['csrf'], auth=auth_payload()), 201

@app.post('/api/auth/login')
def student_login():
    data = payload()
    if not valid_text(data, 'username', 60) or not valid_text(data, 'password', 128):
        return jsonify(error='أدخل اسم المستخدم وكلمة المرور.'), 400
    key = request.remote_addr
    now = time.time()
    attempts = [stamp for stamp in student_attempts.get(key, []) if now - stamp < 300]
    if len(attempts) >= 10:
        return jsonify(error='محاولات كثيرة. حاول بعد خمس دقائق.'), 429
    with db() as conn:
        user = conn.execute("SELECT * FROM accounts WHERE username=? AND role='student'", (data['username'].strip().lower(),)).fetchone()
    if not user or not check_password_hash(user['password_hash'], data['password']):
        student_attempts[key] = attempts + [now]
        return jsonify(error='اسم المستخدم أو كلمة المرور غير صحيحة.'), 401
    student_attempts.pop(key, None)
    start_student_session(user['id'], user['name'])
    return jsonify(ok=True, csrf=session['csrf'], auth=auth_payload())

@app.post('/api/auth/logout')
def student_logout():
    session.pop('account_id', None)
    session.pop('account_active', None)
    session['visitor'] = secrets.token_hex(24)
    session.setdefault('csrf', secrets.token_hex(24))
    return jsonify(ok=True, csrf=session['csrf'], auth=auth_payload())

@app.post('/api/auth/visitor')
def continue_as_visitor():
    session.pop('account_id', None)
    session.pop('account_active', None)
    session.pop('staff_id', None)
    session.pop('staff_active', None)
    session['visitor'] = secrets.token_hex(24)
    session.setdefault('csrf', secrets.token_hex(24))
    with db() as conn:
        conn.execute(
            "INSERT INTO preferences(owner,name,audience,theme) VALUES (?,?,?,?) ON CONFLICT(owner) DO UPDATE SET audience='زائر'",
            (session['visitor'], 'زائر', 'زائر', 'light'),
        )
    return jsonify(ok=True, csrf=session['csrf'], auth=auth_payload())

@app.get('/api/staff/session')
def staff_session():
    with db() as conn:
        setup = not conn.execute('SELECT 1 FROM staff LIMIT 1').fetchone()
        user = None
        if session.get('staff_id') and time.time()-session.get('staff_active',0)<=1800:
            row=conn.execute('SELECT id,name,username,role FROM staff WHERE id=?',(session['staff_id'],)).fetchone()
            user=dict(row) if row else None
    return jsonify(setup_required=setup, user=user, role='admin' if user else None, csrf=session['csrf'])

@app.post('/api/staff/setup')
def staff_setup():
    data=payload()
    allow_remote = os.environ.get('ALLOW_REMOTE_STAFF_SETUP', '').lower() in ('1', 'true', 'yes')
    if not allow_remote and request.remote_addr not in ['127.0.0.1', '::1']:
        return jsonify(error='الإعداد الأول متاح من الجهاز المحلي فقط.'),403
    if not valid_text(data,'username',60,3) or not valid_text(data,'name',60) or not valid_text(data,'password',128,10):
        return jsonify(error='أدخل الاسم واسم مستخدم من ٣ أحرف وكلمة مرور من ١٠ أحرف على الأقل.'),400
    with db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        if conn.execute('SELECT 1 FROM staff LIMIT 1').fetchone():
            return jsonify(error='تم إعداد حساب الأدمن مسبقًا. سجّل الدخول.'),409
        if conn.execute('SELECT 1 FROM accounts WHERE username=?', (data['username'].strip().lower(),)).fetchone():
            return jsonify(error='اسم المستخدم مستخدم مسبقًا.'),409
        uid=conn.execute("INSERT INTO staff(username,name,password_hash,role) VALUES (?,?,?,'admin')",(data['username'].strip().lower(),data['name'].strip(),generate_password_hash(data['password']))).lastrowid
    start_staff_session(uid)
    return jsonify(ok=True,csrf=session['csrf']),201

login_attempts={}
@app.post('/api/staff/login')
def staff_login():
    data=payload()
    if not valid_text(data,'username',60) or not valid_text(data,'password',128):
        return jsonify(error='أدخل اسم المستخدم وكلمة المرور.'),400
    key=request.remote_addr
    now=time.time()
    attempts=[stamp for stamp in login_attempts.get(key,[]) if now-stamp<300]
    if len(attempts)>=10:
        return jsonify(error='محاولات كثيرة. حاول بعد خمس دقائق.'),429
    with db() as conn:
        user=conn.execute("SELECT * FROM staff WHERE username=? AND role='admin'",(data['username'].strip().lower(),)).fetchone()
    if not user or not check_password_hash(user['password_hash'],data['password']):
        login_attempts[key]=attempts+[now]
        return jsonify(error='اسم المستخدم أو كلمة المرور غير صحيحة.'),401
    login_attempts.pop(key,None)
    start_staff_session(user['id'])
    return jsonify(ok=True,csrf=session['csrf'])

@app.post('/api/staff/logout')
def staff_logout():
    session.pop('staff_id',None)
    session.pop('staff_active',None)
    session.setdefault('csrf',secrets.token_hex(24))
    return jsonify(ok=True,csrf=session['csrf'])

@app.get('/api/staff/dashboard')
@staff_required
def staff_dashboard():
    with db() as conn:
        total=conn.execute('SELECT COUNT(*) FROM tickets').fetchone()[0]
        closed=conn.execute("SELECT COUNT(*) FROM tickets WHERE status='مكتمل'").fetchone()[0]
        conversations=conn.execute('SELECT COUNT(*) FROM conversations').fetchone()[0]
        positive,ratings=conn.execute('SELECT COALESCE(SUM(feedback=1),0),COUNT(feedback) FROM messages').fetchone()
        articles=conn.execute("SELECT COUNT(*) FROM knowledge WHERE status='published'").fetchone()[0]
        status=[dict(r) for r in conn.execute('SELECT status,COUNT(*) AS count FROM tickets GROUP BY status')]
        categories=[dict(r) for r in conn.execute('SELECT category,COUNT(*) AS count FROM tickets GROUP BY category ORDER BY count DESC')]
        activity=[dict(r) for r in conn.execute("SELECT date(created,'+3 hours') AS day,COUNT(*) AS count FROM tickets WHERE created>=datetime('now','-7 days') GROUP BY day ORDER BY day")]
        recent=[dict(r) for r in conn.execute('SELECT id,subject,category,status,created FROM tickets ORDER BY id DESC LIMIT 5')]
    return jsonify(total=total,closed=closed,conversations=conversations,positive=positive,ratings=ratings,articles=articles,status=status,categories=categories,activity=activity,recent=recent)

@app.get('/api/staff/tickets')
@staff_required
def staff_tickets():
    with db() as conn:
        result=[dict(r) for r in conn.execute('SELECT id,subject,details,category,status,created FROM tickets ORDER BY id DESC')]
    return jsonify(tickets=result)

@app.get('/api/staff/tickets/<int:tid>')
@staff_required
def staff_ticket_detail(tid):
    with db() as conn:
        ticket=conn.execute('SELECT id,subject,details,category,status,created FROM tickets WHERE id=?',(tid,)).fetchone()
        if not ticket:return jsonify(error='الطلب غير موجود.'),404
        replies=[dict(r) for r in conn.execute('SELECT r.id,r.content,r.created,s.name FROM ticket_replies r JOIN staff s ON s.id=r.staff_id WHERE ticket_id=? ORDER BY r.id',(tid,))]
    return jsonify(ticket=dict(ticket),replies=replies)

@app.post('/api/staff/tickets/<int:tid>')
@staff_required
def staff_ticket_update(tid):
    data=payload()
    if data.get('status') not in ['جديد','قيد المعالجة','مكتمل'] or not isinstance(data.get('reply',''),str) or len(data.get('reply',''))>4000:
        return jsonify(error='راجع حالة الطلب والرد (حتى ٤٠٠٠ حرف).'),400
    with db() as conn:
        ticket=conn.execute('SELECT * FROM tickets WHERE id=?',(tid,)).fetchone()
        if not ticket:return jsonify(error='الطلب غير موجود.'),404
        reply=data.get('reply','').strip()
        conn.execute('UPDATE tickets SET status=? WHERE id=?',(data['status'],tid))
        if reply:
            conn.execute('INSERT INTO ticket_replies(ticket_id,staff_id,content) VALUES (?,?,?)',(tid,session['staff_id'],reply))
        if reply or ticket['status']!=data['status']:
            text=f'رد جديد على طلبك #{tid}' if reply else f'تغيّرت حالة طلبك #{tid} إلى {data["status"]}'
            conn.execute('INSERT INTO notifications(owner,ticket_id,text) VALUES (?,?,?)',(ticket['owner'],tid,text))
    return jsonify(ok=True)

@app.get('/api/staff/knowledge')
@staff_required
def staff_knowledge():
    with db() as conn:
        return jsonify(articles=[dict(r) for r in conn.execute('SELECT * FROM knowledge ORDER BY updated DESC,id DESC')])

@app.post('/api/staff/knowledge')
@staff_required
def staff_knowledge_save():
    data=payload()
    limits={'title':160,'category':100,'question':250,'content':8000,'source':300}
    if any(not valid_text(data,k,v) for k,v in limits.items()) or data.get('status') not in ['draft','published']:
        return jsonify(error='أكمل العنوان والتصنيف والسؤال والمحتوى والمصدر وحالة النشر ضمن الحدود الموضحة.'),400
    values=tuple(data[k].strip() for k in limits)+(data['status'],)
    with db() as conn:
        aid=data.get('id')
        if aid is None:
            aid=conn.execute('INSERT INTO knowledge(title,category,question,content,source,status) VALUES (?,?,?,?,?,?)',values).lastrowid
        elif type(aid) is int:
            result=conn.execute('UPDATE knowledge SET title=?,category=?,question=?,content=?,source=?,status=?,version=version+1,updated=CURRENT_TIMESTAMP WHERE id=?',values+(aid,))
            if not result.rowcount:return jsonify(error='المقالة غير موجودة.'),404
        else:return jsonify(error='معرّف المقالة غير صالح.'),400
    return jsonify(ok=True,id=aid)

@app.post('/api/staff/account')
@staff_required
def staff_account():
    data=payload()
    if not valid_text(data,'name',60) or not valid_text(data,'current_password',128):
        return jsonify(error='أدخل الاسم وكلمة المرور الحالية لحفظ التغييرات.'),400
    new=data.get('new_password','')
    if not isinstance(new,str) or (new and not 10<=len(new)<=128):
        return jsonify(error='كلمة المرور الجديدة يجب أن تكون بين ١٠ و١٢٨ حرفًا.'),400
    with db() as conn:
        user=conn.execute('SELECT * FROM staff WHERE id=?',(session['staff_id'],)).fetchone()
        if not user or not check_password_hash(user['password_hash'],data['current_password']):
            return jsonify(error='كلمة المرور الحالية غير صحيحة.'),400
        conn.execute('UPDATE staff SET name=?,password_hash=? WHERE id=?',(data['name'].strip(),generate_password_hash(new) if new else user['password_hash'],user['id']))
    return jsonify(ok=True)

@app.get('/api/staff/ai')
@admin_required
def ai_settings():
    return jsonify(ai.settings())

@app.post('/api/staff/ai')
@admin_required
def ai_settings_save():
    try:
        ai.save(payload())
        return jsonify(ok=True)
    except AIError as err:
        return jsonify(error=str(err)),400

@app.post('/api/staff/ai/test')
@admin_required
def ai_connection_test():
    if not ai_slots.acquire(blocking=False):
        return jsonify(error='هناك طلبات قيد المعالجة؛ انتظر لحظات.'),429
    try:
        return jsonify(ai.test())
    except AIError as err:
        return jsonify(error=str(err)),502
    finally:
        ai_slots.release()

@app.post('/api/staff/ai/disconnect')
@admin_required
def ai_disconnect():
    try:
        ai.disconnect(payload().get('provider'))
        return jsonify(ok=True)
    except AIError as err:
        return jsonify(error=str(err)),400

if __name__ == '__main__':
    host = os.environ.get('HOST', '127.0.0.1')
    app.run(host=host, port=int(os.environ.get('PORT', '5000')), debug=False)
