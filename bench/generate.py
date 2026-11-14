"""JR-Bench app generator.

Writes small but real, runnable Python apps (standard library only) of different sizes into
bench/apps/<name>/. Each app has shared core modules and one package per entity
(model, repo, service, routes). Bugs are NOT generated here: they are planted at benchmark
time from bench/cases.json, so the clean apps stay correct and every hidden test can be
checked against both the clean and the broken code.

Usage: python3 bench/generate.py
"""

from __future__ import annotations

import shutil
import textwrap
from pathlib import Path

ROOT = Path(__file__).parent / "apps"

# name, package, one-line description, entities: (entity, plural, fields)
# Field kinds: money, count, date, text, ref:<entity>, rate
APPS = [
    ("messmenu", "messmenu", "Hostel mess menus, meal bookings and monthly bills", [
        ("meal", "meals", [("title", "text"), ("price", "money"), ("served_on", "date"), ("plates", "count")]),
        ("booking", "bookings", [("student", "text"), ("meal_id", "ref:meal"), ("plates", "count"), ("booked_on", "date")]),
    ]),
    ("ledgerly", "ledgerly", "Invoices, payments and GST for small shops", [
        ("customer", "customers", [("name", "text"), ("credit_limit", "money"), ("since", "date")]),
        ("invoice", "invoices", [("customer_id", "ref:customer"), ("amount", "money"), ("gst_rate", "rate"), ("issued_on", "date")]),
        ("payment", "payments", [("invoice_id", "ref:invoice"), ("amount", "money"), ("paid_on", "date")]),
        ("expense", "expenses", [("label", "text"), ("amount", "money"), ("spent_on", "date")]),
    ]),
    ("fleetwise", "fleetwise", "College bus routes, trips and fuel logs", [
        ("bus", "buses", [("plate", "text"), ("seats", "count"), ("bought_on", "date")]),
        ("driver", "drivers", [("name", "text"), ("licence_until", "date"), ("trips", "count")]),
        ("route", "routes", [("name", "text"), ("km", "count"), ("fare", "money")]),
        ("trip", "trips", [("bus_id", "ref:bus"), ("route_id", "ref:route"), ("riders", "count"), ("ran_on", "date")]),
        ("fuel", "fuels", [("bus_id", "ref:bus"), ("litres", "count"), ("cost", "money"), ("filled_on", "date")]),
        ("stop", "stops", [("name", "text"), ("route_id", "ref:route"), ("order", "count")]),
        ("buspass", "buspasses", [("student", "text"), ("route_id", "ref:route"), ("price", "money"), ("valid_until", "date")]),
        ("complaint", "complaints", [("text", "text"), ("trip_id", "ref:trip"), ("filed_on", "date")]),
    ]),
    ("clinicq", "clinicq", "Clinic queue, appointments, prescriptions and bills", [
        ("patient", "patients", [("name", "text"), ("age", "count"), ("joined_on", "date")]),
        ("doctor", "doctors", [("name", "text"), ("fee", "money"), ("slots", "count")]),
        ("appointment", "appointments", [("patient_id", "ref:patient"), ("doctor_id", "ref:doctor"), ("on", "date"), ("token", "count")]),
        ("prescription", "prescriptions", [("appointment_id", "ref:appointment"), ("notes", "text"), ("days", "count")]),
        ("medicine", "medicines", [("name", "text"), ("price", "money"), ("stock", "count")]),
        ("bill", "bills", [("appointment_id", "ref:appointment"), ("amount", "money"), ("discount_rate", "rate")]),
        ("lab", "labs", [("name", "text"), ("price", "money"), ("hours", "count")]),
        ("report", "reports", [("lab_id", "ref:lab"), ("patient_id", "ref:patient"), ("ready_on", "date")]),
        ("visit", "visits", [("patient_id", "ref:patient"), ("on", "date"), ("minutes", "count")]),
    ]),
    ("campuskart", "campuskart", "A student marketplace: listings, offers, orders and reviews", [
        ("seller", "sellers", [("name", "text"), ("rating_sum", "count"), ("joined_on", "date")]),
        ("listing", "listings", [("seller_id", "ref:seller"), ("title", "text"), ("price", "money"), ("listed_on", "date")]),
        ("offer", "offers", [("listing_id", "ref:listing"), ("amount", "money"), ("made_on", "date")]),
        ("order", "orders", [("listing_id", "ref:listing"), ("quantity", "count"), ("total", "money"), ("placed_on", "date")]),
        ("review", "reviews", [("order_id", "ref:order"), ("stars", "count"), ("text", "text")]),
        ("category", "categories", [("name", "text"), ("items", "count")]),
        ("coupon", "coupons", [("code", "text"), ("discount_rate", "rate"), ("valid_until", "date")]),
        ("chat", "chats", [("listing_id", "ref:listing"), ("messages", "count"), ("started_on", "date")]),
        ("report", "reports", [("listing_id", "ref:listing"), ("reason", "text"), ("filed_on", "date")]),
        ("payout", "payouts", [("seller_id", "ref:seller"), ("amount", "money"), ("paid_on", "date")]),
        ("wishlist", "wishlists", [("student", "text"), ("listing_id", "ref:listing"), ("added_on", "date")]),
        ("pickup", "pickups", [("order_id", "ref:order"), ("spot", "text"), ("at", "date")]),
        ("refund", "refunds", [("order_id", "ref:order"), ("amount", "money"), ("asked_on", "date")]),
    ]),
    ("examhall", "examhall", "An online exam platform: exams, questions, attempts, submissions and results", [
        ("college", "colleges", [("name", "text"), ("students", "count"), ("joined_on", "date")]),
        ("student", "students", [("name", "text"), ("college_id", "ref:college"), ("joined_on", "date")]),
        ("exam", "exams", [("title", "text"), ("duration_min", "count"), ("starts_on", "date"), ("fee", "money")]),
        ("question", "questions", [("exam_id", "ref:exam"), ("text", "text"), ("marks", "count")]),
        ("attempt", "attempts", [("exam_id", "ref:exam"), ("student_id", "ref:student"), ("started_on", "date"), ("answered", "count")]),
        ("submission", "submissions", [("attempt_id", "ref:attempt"), ("code", "text"), ("score", "count"), ("submitted_on", "date")]),
        ("result", "results", [("attempt_id", "ref:attempt"), ("marks", "count"), ("percent", "rate")]),
        ("proctorlog", "proctorlogs", [("attempt_id", "ref:attempt"), ("event", "text"), ("at", "date")]),
        ("certificate", "certificates", [("result_id", "ref:result"), ("issued_on", "date")]),
        ("batch", "batches", [("name", "text"), ("college_id", "ref:college"), ("size", "count")]),
        ("invigilator", "invigilators", [("name", "text"), ("exams", "count")]),
        ("hall", "halls", [("name", "text"), ("seats", "count")]),
        ("slot", "slots", [("exam_id", "ref:exam"), ("hall_id", "ref:hall"), ("on", "date")]),
        ("payment", "payments", [("student_id", "ref:student"), ("amount", "money"), ("paid_on", "date")]),
        ("notice", "notices", [("title", "text"), ("posted_on", "date")]),
        ("feedback", "feedbacks", [("exam_id", "ref:exam"), ("stars", "count"), ("text", "text")]),
        ("leaderboard", "leaderboards", [("exam_id", "ref:exam"), ("entries", "count")]),
        ("plagiarism", "plagiarisms", [("submission_id", "ref:submission"), ("similarity", "rate")]),
    ]),
]

CORE = {
    "errors.py": '''
        """Errors the app raises on purpose; routes turn them into clear responses."""


        class AppError(Exception):
            status = 400


        class ValidationError(AppError):
            status = 400


        class NotFound(AppError):
            status = 404
        ''',
    "money.py": '''
        """Money helpers. Amounts are rupees with two decimals."""

        from decimal import ROUND_HALF_UP, Decimal


        def to_money(value) -> Decimal:
            return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


        def add_rate(amount, rate) -> Decimal:
            """Adds a percentage, e.g. GST at 18 percent."""
            return to_money(to_money(amount) * (1 + Decimal(str(rate)) / 100))


        def apply_discount(amount, rate) -> Decimal:
            rate = max(0, min(100, rate))
            return to_money(to_money(amount) * (1 - Decimal(str(rate)) / 100))


        def split_evenly(amount, people: int) -> Decimal:
            if people <= 0:
                raise ValueError("people must be positive")
            return to_money(to_money(amount) / people)


        def total(amounts) -> Decimal:
            return to_money(sum((to_money(a) for a in amounts), Decimal("0")))
        ''',
    "dates.py": '''
        """Dates arrive as YYYY-MM-DD strings; times are kept in UTC and shown in India time."""

        from datetime import date, datetime, timedelta, timezone

        IST = timezone(timedelta(hours=5, minutes=30))


        def parse_date(text: str) -> date:
            return datetime.strptime(text.strip(), "%Y-%m-%d").date()


        def days_between(start: date, end: date) -> int:
            return (end - start).days


        def now_utc() -> datetime:
            return datetime.now(timezone.utc)


        def to_ist(moment: datetime) -> datetime:
            return moment.astimezone(IST)


        def is_past(day: date, today: date | None = None) -> bool:
            today = today or now_utc().date()
            return day < today
        ''',
    "text.py": '''
        """Text helpers for names and titles."""

        import re


        def slugify(text: str) -> str:
            return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


        def truncate(text: str, limit: int = 60) -> str:
            return text if len(text) <= limit else text[: limit - 1] + "…"


        def initials(name: str) -> str:
            return "".join(part[0].upper() for part in name.split() if part)
        ''',
    "pagination.py": '''
        """Splits long lists into pages."""


        def paginate(items, page: int = 1, size: int = 20):
            page = max(1, int(page))
            size = max(1, min(100, int(size)))
            start = (page - 1) * size
            return {"items": items[start : start + size], "page": page, "size": size, "total": len(items)}


        def page_count(total: int, size: int) -> int:
            return (total + size - 1) // size
        ''',
    "http.py": '''
        """Tiny request and response helpers shared by every route."""

        from .errors import AppError, ValidationError


        def require_fields(body: dict, *names: str) -> None:
            missing = [n for n in names if body.get(n) in (None, "")]
            if missing:
                raise ValidationError("missing: " + ", ".join(missing))


        def ok(data, status: int = 200) -> dict:
            return {"status": status, "data": data}


        def fail(error: AppError) -> dict:
            return {"status": error.status, "error": str(error)}


        def query_int(request: dict, name: str, default: int) -> int:
            value = request.get("query", {}).get(name)
            return int(value) if value not in (None, "") else default
        ''',
    "config.py": '''
        """Settings, read once at start-up."""

        SETTINGS = {
            "currency": "INR",
            "page_size": 20,
            "gst_default": 18,
            "max_upload_kb": 512,
        }


        def setting(name: str):
            return SETTINGS[name]
        ''',
    "store.py": '''
        """An in-memory store with the same shape as a database table."""

        from .errors import NotFound


        class Store:
            def __init__(self, name: str):
                self.name = name
                self.rows: dict[int, object] = {}
                self.next_id = 1

            def add(self, row):
                row.id = self.next_id
                self.rows[row.id] = row
                self.next_id += 1
                return row

            def get(self, row_id: int):
                row = self.rows.get(int(row_id))
                if row is None:
                    raise NotFound(f"{self.name} {row_id} not found")
                return row

            def all(self):
                return list(self.rows.values())

            def delete(self, row_id: int) -> None:
                self.get(row_id)
                del self.rows[int(row_id)]
        ''',
}

PY_TYPE = {"money": "Decimal", "count": "int", "date": "date", "text": "str", "rate": "float"}


def field_type(kind: str) -> str:
    return "int" if kind.startswith("ref:") else PY_TYPE[kind]


def convert(kind: str, expr: str) -> str:
    if kind == "money":
        return f"to_money({expr})"
    if kind in ("count",) or kind.startswith("ref:"):
        return f"int({expr})"
    if kind == "rate":
        return f"float({expr})"
    if kind == "date":
        return f"parse_date({expr})"
    return f"str({expr}).strip()"


def entity_files(pkg: str, name: str, plural: str, fields: list[tuple[str, str]]) -> dict[str, str]:
    """Builds the four modules for one entity. Code is assembled line by line, flush left."""
    cls = name.capitalize()
    money = [f for f, k in fields if k == "money"]
    counts = [f for f, k in fields if k == "count"]
    dates = [f for f, k in fields if k == "date"]
    texts = [f for f, k in fields if k == "text"]
    refs = [(f, k[4:]) for f, k in fields if k.startswith("ref:")]
    rates = [f for f, k in fields if k == "rate"]
    P = plural.upper()

    checks = []
    for f in money + counts:
        checks += [f"        if self.{f} < 0:", f'            raise ValidationError("{f} must not be negative")']
    for f in rates:
        checks += [f"        if not 0 <= self.{f} <= 100:", f'            raise ValidationError("{f} must be between 0 and 100")']
    for f in texts:
        checks += [f"        if not self.{f}:", f'            raise ValidationError("{f} is required")']
    bits = [f"{{self.{texts[0]}}}" if texts else "#{self.id}"]
    if money:
        bits.append(f"\u20b9{{self.{money[0]}}}")
    if dates:
        bits.append(f"on {{self.{dates[0]}.isoformat()}}")
    model = "\n".join([
        f'"""{cls} records."""',
        "",
        "from dataclasses import dataclass, field",
        "from datetime import date",
        "from decimal import Decimal",
        "",
        "from ..core.errors import ValidationError",
        "",
        "",
        "@dataclass",
        f"class {cls}:",
        *[f"    {f}: {field_type(k)}" for f, k in fields],
        "    id: int = 0",
        "    tags: list = field(default_factory=list)",
        "",
        f'    def validate(self) -> "{cls}":',
        *checks,
        "        return self",
        "",
        "    def describe(self) -> str:",
        f'        return f"{" · ".join(bits)}"',
    ])

    repo = "\n".join([
        f'"""Where {plural} are kept."""',
        "",
        "from ..core.store import Store",
        f"from .model import {cls}",
        "",
        f'{P} = Store("{name}")',
        "",
        "",
        f"def save({name}: {cls}) -> {cls}:",
        f"    return {P}.add({name}.validate())",
        "",
        "",
        f"def find({name}_id: int) -> {cls}:",
        f"    return {P}.get({name}_id)",
        "",
        "",
        f"def all_{plural}() -> list[{cls}]:",
        f"    return {P}.all()",
        "",
        "",
        f"def remove({name}_id: int) -> None:",
        f"    {P}.delete({name}_id)",
    ])

    summary = ['        "count": len(items),']
    for f in money:
        summary.append(f'        "total_{f}": str(total(i.{f} for i in items)),')
        summary.append(f'        "average_{f}": str(to_money(total(i.{f} for i in items) / len(items))) if items else "0.00",')
    for f in counts:
        summary.append(f'        "total_{f}": sum(i.{f} for i in items),')
    for f in dates:
        summary.append(f'        "latest_{f}": max((i.{f} for i in items), default=None),')
    extra: list[str] = []
    if dates:
        d = dates[0]
        extra += ["", "", f"def overdue({plural}: list | None = None, today=None) -> list:", f'    """{plural.capitalize()} whose {d} is in the past."""',
                  f"    items = {plural} if {plural} is not None else repo.all_{plural}()", f"    return [i for i in items if is_past(i.{d}, today)]"]
    if money and counts:
        extra += ["", "", f"def per_unit({name}_id: int):", f'    """{money[0]} per {counts[0]}, for reports."""', f"    item = repo.find({name}_id)",
                  f"    return to_money(item.{money[0]} / item.{counts[0]})"]
    if rates and money:
        extra += ["", "", f"def with_rate({name}_id: int):", f"    item = repo.find({name}_id)", f"    return add_rate(item.{money[0]}, item.{rates[0]})"]
    service = "\n".join([
        f'"""Business rules for {plural}."""',
        "",
        "from ..core.dates import is_past, parse_date",
        "from ..core.money import add_rate, to_money, total",
        *sorted({f"from ..{o} import repo as {o}_repo" for _, o in refs}),
        "from . import repo",
        f"from .model import {cls}",
        "",
        "",
        f"def create(data: dict) -> {cls}:",
        f"    {name} = {cls}(",
        *[f"        {f}={convert(k, f'data[{chr(34)}{f}{chr(34)}]')}," for f, k in fields],
        "    )",
        *[f"    {o}_repo.find({name}.{f})" for f, o in refs],
        f"    return repo.save({name})",
        "",
        "",
        "def summary(items: list | None = None) -> dict:",
        f"    items = items if items is not None else repo.all_{plural}()",
        "    return {",
        *summary,
        "    }",
        *extra,
    ])

    required = ", ".join(f'"{f}"' for f, _ in fields)
    routes = "\n".join([
        f'"""HTTP handlers for /api/{plural}."""',
        "",
        "from ..core.config import setting",
        "from ..core.errors import AppError",
        "from ..core.http import fail, ok, query_int, require_fields",
        "from ..core.pagination import paginate",
        "from . import repo, service",
        "",
        "",
        f"def create_{name}(request: dict) -> dict:",
        '    body = request.get("body") or {}',
        "    try:",
        f"        require_fields(body, {required})",
        "        return ok(service.create(body).describe(), 201)",
        "    except AppError as error:",
        "        return fail(error)",
        "",
        "",
        f"def list_{plural}(request: dict) -> dict:",
        '    page = query_int(request, "page", 1)',
        '    size = query_int(request, "size", setting("page_size"))',
        f"    rows = [r.describe() for r in repo.all_{plural}()]",
        "    return ok(paginate(rows, page, size))",
        "",
        "",
        f"def {name}_summary(request: dict) -> dict:",
        "    return ok(service.summary())",
        "",
        "",
        "ROUTES = {",
        f'    ("POST", "/api/{plural}"): create_{name},',
        f'    ("GET", "/api/{plural}"): list_{plural},',
        f'    ("GET", "/api/{plural}/summary"): {name}_summary,',
        "}",
    ])
    return {
        "__init__.py": f'"""{cls}: model, storage, rules and HTTP handlers."""\n',
        "model.py": model,
        "repo.py": repo,
        "service.py": service,
        "routes.py": routes,
    }


def clean(text: str) -> str:
    # Core modules are written as indented triple-quoted strings; entity modules are already flush left.
    return textwrap.dedent(text).lstrip("\n").rstrip() + "\n"


def write_app(name: str, pkg: str, about: str, entities) -> int:
    root = ROOT / name
    if root.exists():
        shutil.rmtree(root)
    base = root / pkg
    (base / "core").mkdir(parents=True)
    files = 0

    def put(path: Path, text: str) -> None:
        nonlocal files
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(clean(text))
        files += 1

    put(base / "__init__.py", f'"""{about}."""\n')
    put(base / "core" / "__init__.py", '"""Shared helpers."""\n')
    for fname, text in CORE.items():
        put(base / "core" / fname, text)
    for ent, plural, fields in entities:
        for fname, text in entity_files(pkg, ent, plural, fields).items():
            put(base / ent / fname, text)
    imports = "\n".join(f"from .{e} import routes as {e}_routes" for e, _, _ in entities)
    merges = "\n".join(f"ROUTES.update({e}_routes.ROUTES)" for e, _, _ in entities)
    app_py = "\n".join([
        f'"""{about}. Routes every request to its handler."""',
        "",
        "from .core.errors import NotFound",
        "from .core.http import fail",
        *[f"from .{e} import routes as {e}_routes" for e, _, _ in entities],
        "",
        "ROUTES = {}",
        *[f"ROUTES.update({e}_routes.ROUTES)" for e, _, _ in entities],
        "",
        "",
        "def handle(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:",
        "    handler = ROUTES.get((method, path))",
        "    if handler is None:",
        '        return fail(NotFound(f"no route {method} {path}"))',
        '    return handler({"body": body or {}, "query": query or {}, "path": path})',
    ])
    (base / "app.py").write_text(app_py + "\n")
    files += 1
    put(root / "README.md", f"# {name}\n\n{about}. Part of JR-Bench: a generated sample app with errors planted on purpose.\n")
    return files


# ---------------------------------------------------------------- JavaScript (Node.js, CommonJS) app

JS_APP = ("tiffinbox", "Tiffin deliveries: kitchens, menus, orders, riders and payouts", [
    ("kitchen", "kitchens", [("name", "text"), ("rating", "count"), ("opened_on", "date")]),
    ("menu", "menus", [("kitchen_id", "ref:kitchen"), ("dish", "text"), ("price", "money"), ("served_on", "date")]),
    ("order", "orders", [("menu_id", "ref:menu"), ("plates", "count"), ("total", "money"), ("placed_on", "date")]),
    ("rider", "riders", [("name", "text"), ("trips", "count"), ("joined_on", "date")]),
    ("payout", "payouts", [("rider_id", "ref:rider"), ("amount", "money"), ("paid_on", "date")]),
])

JS_CORE = {
    "errors.js": """
        'use strict';
        // Errors the app raises on purpose; routes turn them into clear responses.
        class AppError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
        class ValidationError extends AppError { constructor(message) { super(message, 400); } }
        class NotFound extends AppError { constructor(message) { super(message, 404); } }
        module.exports = { AppError, ValidationError, NotFound };
        """,
    "money.js": """
        'use strict';
        // Money helpers. Amounts are rupees, kept as numbers with two decimals.
        function toMoney(value) {
          const n = Number(value);
          if (!Number.isFinite(n)) throw new TypeError(`not an amount: ${value}`);
          return Math.round(n * 100) / 100;
        }
        function total(amounts) {
          return toMoney(amounts.reduce((sum, a) => sum + toMoney(a), 0));
        }
        function average(amounts) {
          return amounts.length ? toMoney(total(amounts) / amounts.length) : 0;
        }
        function addRate(amount, rate) {
          return toMoney(toMoney(amount) * (1 + Number(rate) / 100));
        }
        module.exports = { toMoney, total, average, addRate };
        """,
    "dates.js": """
        'use strict';
        // Dates arrive as YYYY-MM-DD strings.
        function parseDate(text) {
          const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(text).trim());
          if (!m) throw new RangeError(`not a date: ${text}`);
          return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
        }
        function isoDay(date) {
          return date.toISOString().slice(0, 10);
        }
        function isPast(date, today = new Date()) {
          return date.getTime() < today.getTime();
        }
        module.exports = { parseDate, isoDay, isPast };
        """,
    "http.js": """
        'use strict';
        const { ValidationError } = require('./errors');
        // Tiny request and response helpers shared by every route.
        function requireFields(body, ...names) {
          const missing = names.filter((n) => body[n] === undefined || body[n] === null || body[n] === '');
          if (missing.length) throw new ValidationError(`missing: ${missing.join(', ')}`);
        }
        const ok = (data, status = 200) => ({ status, data });
        const fail = (error) => ({ status: error.status, error: error.message });
        function queryInt(request, name, fallback) {
          const value = (request.query || {})[name];
          return value === undefined || value === '' ? fallback : parseInt(value, 10);
        }
        module.exports = { requireFields, ok, fail, queryInt };
        """,
    "config.js": """
        'use strict';
        // Settings, read once at start-up.
        const SETTINGS = { currency: 'INR', pageSize: 20, gstDefault: 5 };
        function setting(name) {
          if (!(name in SETTINGS)) throw new Error(`unknown setting ${name}`);
          return SETTINGS[name];
        }
        module.exports = { SETTINGS, setting };
        """,
    "store.js": """
        'use strict';
        const { NotFound } = require('./errors');
        // An in-memory store with the same shape as a database table.
        class Store {
          constructor(name) { this.name = name; this.rows = new Map(); this.nextId = 1; }
          add(row) { row.id = this.nextId++; this.rows.set(row.id, row); return row; }
          get(id) {
            const row = this.rows.get(Number(id));
            if (!row) throw new NotFound(`${this.name} ${id} not found`);
            return row;
          }
          all() { return [...this.rows.values()]; }
        }
        module.exports = { Store };
        """,
    "pagination.js": """
        'use strict';
        // Splits long lists into pages.
        function paginate(items, page = 1, size = 20) {
          page = Math.max(1, page);
          size = Math.max(1, Math.min(100, size));
          const start = (page - 1) * size;
          return { items: items.slice(start, start + size), page, size, total: items.length };
        }
        module.exports = { paginate };
        """,
}


def js_convert(kind: str, expr: str) -> str:
    if kind == "money":
        return f"toMoney({expr})"
    if kind == "count" or kind.startswith("ref:"):
        return f"Number({expr})"
    if kind == "date":
        return f"parseDate({expr})"
    return f"String({expr}).trim()"


def js_entity(name: str, plural: str, fields) -> dict[str, str]:
    cls = name.capitalize()
    money = [f for f, k in fields if k == "money"]
    counts = [f for f, k in fields if k == "count"]
    dates = [f for f, k in fields if k == "date"]
    texts = [f for f, k in fields if k == "text"]
    refs = [(f, k[4:]) for f, k in fields if k.startswith("ref:")]
    camel = lambda f: f.split("_")[0] + "".join(w.capitalize() for w in f.split("_")[1:])
    checks = []
    for f in money + counts:
        checks += [f"  if (!(item.{camel(f)} >= 0)) throw new ValidationError('{f} must not be negative');"]
    for f in texts:
        checks += [f"  if (!item.{camel(f)}) throw new ValidationError('{f} is required');"]
    bits = [f"${{item.{camel(texts[0])}}}" if texts else "#${item.id}"]
    if money:
        bits.append(f"Rs ${{item.{camel(money[0])}.toFixed(2)}}")
    if dates:
        bits.append(f"on ${{isoDay(item.{camel(dates[0])})}}")
    model = "\n".join([
        "'use strict';",
        "const { ValidationError } = require('../core/errors');",
        "const { isoDay } = require('../core/dates');",
        "",
        f"// {cls} records.",
        f"function validate(item) {{",
        *checks,
        "  return item;",
        "}",
        "",
        "function describe(item) {",
        f"  return `{' · '.join(bits)}`;",
        "}",
        "",
        "module.exports = { validate, describe };",
    ])
    repo = "\n".join([
        "'use strict';",
        "const { Store } = require('../core/store');",
        "const { validate } = require('./model');",
        "",
        f"const {plural.upper()} = new Store('{name}');",
        "",
        f"const save = (item) => {plural.upper()}.add(validate(item));",
        f"const find = (id) => {plural.upper()}.get(id);",
        f"const all = () => {plural.upper()}.all();",
        "",
        "module.exports = { save, find, all };",
    ])
    summary = ["    count: items.length,"]
    for f in money:
        summary.append(f"    total{camel(f).capitalize()}: total(items.map((i) => i.{camel(f)})),")
        summary.append(f"    average{camel(f).capitalize()}: average(items.map((i) => i.{camel(f)})),")
    for f in counts:
        summary.append(f"    total{camel(f).capitalize()}: items.reduce((s, i) => s + i.{camel(f)}, 0),")
    extra = []
    if money and counts:
        extra += ["", f"function perUnit(id) {{", f"  const item = repo.find(id);", f"  return toMoney(item.{camel(money[0])} / item.{camel(counts[0])});", "}"]
    service = "\n".join([
        "'use strict';",
        "const { parseDate } = require('../core/dates');",
        "const { toMoney, total, average } = require('../core/money');",
        *sorted({f"const {o}Repo = require('../{o}/repo');" for _, o in refs}),
        "const repo = require('./repo');",
        "",
        f"// Business rules for {plural}.",
        "function create(data) {",
        "  const item = {",
        *[f"    {camel(f)}: {js_convert(k, f'data.{f}')}," for f, k in fields],
        "  };",
        *[f"  {o}Repo.find(item.{camel(f)});" for f, o in refs],
        "  return repo.save(item);",
        "}",
        "",
        "function summary(items = repo.all()) {",
        "  return {",
        *summary,
        "  };",
        "}",
        *extra,
        "",
        f"module.exports = {{ create, summary{', perUnit' if money and counts else ''} }};",
    ])
    required = ", ".join(f"'{f}'" for f, _ in fields)
    routes = "\n".join([
        "'use strict';",
        "const { setting } = require('../core/config');",
        "const { AppError } = require('../core/errors');",
        "const { requireFields, ok, fail, queryInt } = require('../core/http');",
        "const { paginate } = require('../core/pagination');",
        "const { describe } = require('./model');",
        "const repo = require('./repo');",
        "const service = require('./service');",
        "",
        f"// HTTP handlers for /api/{plural}.",
        f"function create{cls}(request) {{",
        "  const body = request.body || {};",
        "  try {",
        f"    requireFields(body, {required});",
        "    return ok(describe(service.create(body)), 201);",
        "  } catch (error) {",
        "    if (error instanceof AppError) return fail(error);",
        "    throw error;",
        "  }",
        "}",
        "",
        f"function list{cls}s(request) {{",
        "  const page = queryInt(request, 'page', 1);",
        "  const size = queryInt(request, 'size', setting('pageSize'));",
        "  return ok(paginate(repo.all().map(describe), page, size));",
        "}",
        "",
        f"const summary{cls}s = () => ok(service.summary());",
        "",
        "module.exports = {",
        f"  'POST /api/{plural}': create{cls},",
        f"  'GET /api/{plural}': list{cls}s,",
        f"  'GET /api/{plural}/summary': summary{cls}s,",
        "};",
    ])
    return {"model.js": model, "repo.js": repo, "service.js": service, "routes.js": routes}


def write_js_app() -> int:
    name, about, entities = JS_APP
    root = ROOT / name
    if root.exists():
        shutil.rmtree(root)
    files = 0

    def put(path: Path, text: str) -> None:
        nonlocal files
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text.rstrip() + "\n")
        files += 1

    for fname, text in JS_CORE.items():
        put(root / "src" / "core" / fname, clean(text))
    for ent, plural, fields in entities:
        for fname, text in js_entity(ent, plural, fields).items():
            put(root / "src" / ent / fname, text)
    put(root / "src" / "app.js", "\n".join([
        "'use strict';",
        "const { NotFound } = require('./core/errors');",
        "const { fail } = require('./core/http');",
        "",
        f"// {about}. Routes every request to its handler.",
        "const ROUTES = Object.assign({},",
        *[f"  require('./{e}/routes')," for e, _, _ in entities],
        ");",
        "",
        "function handle(method, path, body = {}, query = {}) {",
        "  const handler = ROUTES[`${method} ${path}`];",
        "  if (!handler) return fail(new NotFound(`no route ${method} ${path}`));",
        "  return handler({ body, query, path });",
        "}",
        "",
        "module.exports = { handle, ROUTES };",
    ]))
    put(root / "package.json", '{\n  "name": "tiffinbox",\n  "private": true,\n  "main": "src/app.js"\n}')
    put(root / "README.md", f"# {name}\n\n{about}. Part of JR-Bench (Node.js): a generated sample app with errors planted on purpose.\n")
    return files


if __name__ == "__main__":
    for name, pkg, about, entities in APPS:
        n = write_app(name, pkg, about, entities)
        print(f"{name}: {n} files")
    print(f"tiffinbox: {write_js_app()} files (Node.js)")
