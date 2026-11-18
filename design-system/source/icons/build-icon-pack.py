"""Fetch a pinned official Lucide release and preserve original SVGs."""
import hashlib
import io
import json
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VERSION = "1.61.0"
TARBALL = f"https://registry.npmjs.org/lucide-static/-/lucide-static-{VERSION}.tgz"
# Preserve an existing release and append new contract requirements idempotently.
if (ROOT / "icon-manifest.json").exists() and (ROOT / "reconcile-icon-pack.py").exists():
    import subprocess
    import sys
    subprocess.run([sys.executable, str(ROOT / "reconcile-icon-pack.py")], check=True)
    raise SystemExit(0)
GROUPS = {
    "Navigation": [
        ("house", "Home", "الرئيسية"), ("layout-dashboard", "Overview", "نظرة عامة"),
        ("menu", "Menu", "القائمة"), ("panel-left", "Sidebar", "القائمة الجانبية"),
        ("chevron-left", "Previous", "السابق"), ("chevron-right", "Next", "التالي"),
        ("chevron-down", "Expand", "توسيع"), ("chevron-up", "Collapse", "طي"),
        ("arrow-left", "Back", "رجوع"), ("arrow-right", "Continue", "متابعة"),
        ("arrow-up-right", "Open link", "فتح الرابط"), ("external-link", "External link", "رابط خارجي"),
        ("search", "Search", "بحث"), ("filter", "Filter", "تصفية"),
        ("list-filter", "Advanced filters", "عوامل التصفية"), ("sliders-horizontal", "Adjust", "ضبط"),
    ],
    "Appointments": [
        ("calendar", "Calendar", "التقويم"), ("calendar-days", "Appointments", "المواعيد"),
        ("calendar-plus", "New appointment", "موعد جديد"), ("calendar-check", "Confirmed appointment", "موعد مؤكد"),
        ("calendar-x", "Cancel appointment", "إلغاء الموعد"), ("calendar-clock", "Reschedule", "تغيير الموعد"),
        ("clock", "Time", "الوقت"), ("timer", "Duration", "المدة"),
        ("list", "List view", "عرض القائمة"), ("columns-3", "Day view", "عرض اليوم"),
        ("map-pin", "Location", "الموقع"), ("building-2", "Clinic", "العيادة"),
        ("door-open", "Room", "الغرفة"), ("bell", "Notifications", "التنبيهات"),
        ("bell-ring", "Reminder", "تذكير"), ("repeat-2", "Recurring appointment", "موعد متكرر"),
    ],
    "People and communication": [
        ("user", "Patient", "المراجعة"), ("users", "Patients", "المراجعات"),
        ("user-plus", "Add patient", "إضافة مراجعة"), ("user-round-check", "Patient verified", "بيانات المراجعة مؤكدة"),
        ("contact-round", "Patient profile", "ملف المراجعة"), ("briefcase-medical", "Care team", "الفريق الطبي"),
        ("phone", "Phone", "الهاتف"), ("mail", "Email", "البريد الإلكتروني"),
        ("message-square", "Messages", "الرسائل"), ("send", "Send", "إرسال"),
        ("video", "Video consultation", "استشارة مرئية"), ("languages", "Language", "اللغة"),
    ],
    "Clinical": [
        ("stethoscope", "Consultation", "الاستشارة"), ("heart-pulse", "Vitals", "المؤشرات الحيوية"),
        ("activity", "Clinical activity", "النشاط السريري"), ("clipboard-plus", "Medical record", "السجل الطبي"),
        ("syringe", "Injection", "الحقن"), ("pill", "Medication", "الدواء"),
        ("microscope", "Lab tests", "التحاليل"), ("thermometer", "Temperature", "درجة الحرارة"),
        ("droplets", "Skin treatment", "علاج البشرة"), ("bandage", "Aftercare", "الرعاية اللاحقة"),
        ("shield-check", "Consent recorded", "الموافقة مسجلة"), ("cross", "Medical services", "الخدمات الطبية"),
        ("file-heart", "Care plan", "خطة الرعاية"), ("notebook-pen", "Clinical notes", "الملاحظات السريرية"),
    ],
    "Finance": [
        ("wallet", "Payments", "المدفوعات"), ("credit-card", "Card", "البطاقة"),
        ("banknote", "Cash", "نقداً"), ("receipt", "Invoice", "الفاتورة"),
        ("receipt-text", "Invoice details", "تفاصيل الفاتورة"), ("badge-percent", "Discount", "الخصم"),
        ("rotate-ccw", "Refund", "استرداد المبلغ"), ("circle-dollar-sign", "Price", "السعر"),
        ("landmark", "Bank transfer", "تحويل بنكي"), ("chart-no-axes-combined", "Revenue report", "تقرير الإيرادات"),
        ("file-check", "Paid invoice", "فاتورة مدفوعة"), ("file-clock", "Pending invoice", "فاتورة معلقة"),
    ],
    "Inventory": [
        ("package", "Inventory", "المخزون"), ("boxes", "Stock items", "أصناف المخزون"),
        ("package-plus", "Add stock", "إضافة مخزون"), ("package-minus", "Deduct stock", "خصم مخزون"),
        ("scan-barcode", "Scan barcode", "مسح الباركود"), ("barcode", "Barcode", "الباركود"),
        ("truck", "Delivery", "التوريد"), ("archive", "Archive", "الأرشيف"),
        ("clipboard-list", "Stock count", "جرد المخزون"), ("history", "History", "السجل"),
    ],
    "Actions": [
        ("plus", "Add", "إضافة"), ("minus", "Remove", "إزالة"),
        ("pencil", "Edit", "تعديل"), ("trash-2", "Delete", "حذف"),
        ("copy", "Copy", "نسخ"), ("download", "Download", "تنزيل"),
        ("upload", "Upload", "رفع"), ("printer", "Print", "طباعة"),
        ("save", "Save", "حفظ"), ("ellipsis", "More actions", "إجراءات أخرى"),
        ("refresh-cw", "Refresh", "تحديث"), ("link", "Link", "رابط"),
    ],
    "Feedback and system": [
        ("check", "Selected", "محدد"), ("x", "Close", "إغلاق"),
        ("circle-check", "Success", "تم بنجاح"), ("circle-alert", "Error", "خطأ"),
        ("triangle-alert", "Warning", "تنبيه"), ("info", "Information", "معلومة"),
        ("circle-help", "Help", "المساعدة"), ("loader-circle", "Loading", "جارٍ التحميل"),
        ("wifi-off", "Offline", "غير متصل"), ("cloud-off", "Status unknown", "الحالة غير معروفة"),
        ("settings", "Settings", "الإعدادات"), ("lock-keyhole", "Locked", "مقفل"),
        ("eye", "Show", "إظهار"), ("eye-off", "Hide", "إخفاء"),
        ("sun", "Light theme", "المظهر الفاتح"), ("moon", "Dark theme", "المظهر الداكن"),
        ("log-out", "Sign out", "تسجيل الخروج"), ("monitor", "Display", "العرض"),
    ],
}
MIRROR = {"panel-left", "chevron-left", "chevron-right", "arrow-left", "arrow-right", "send", "log-out"}
CONTEXTUAL = {"arrow-up-right", "external-link"}

ROOT.mkdir(parents=True, exist_ok=True)
(ROOT / "svg").mkdir(exist_ok=True)
cache = ROOT / "cache" / f"lucide-static-{VERSION}.tgz"
cache.parent.mkdir(exist_ok=True)
if not cache.exists():
    cache.write_bytes(urllib.request.urlopen(TARBALL).read())
archive_bytes = cache.read_bytes()
archive = tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz")
members = {member.name: member for member in archive.getmembers()}
icons = []
for category, entries in GROUPS.items():
    for name, english, arabic in entries:
        member_name = f"package/icons/{name}.svg"
        if member_name not in members:
            raise ValueError(f"Missing official icon: {name}")
        original = archive.extractfile(members[member_name]).read()
        target = ROOT / "svg" / f"{name}.svg"
        target.write_bytes(original)
        icons.append({
            "name": name, "component_name": f"Icon/{category}/{name}", "category": category,
            "label_en": english, "label_ar": arabic, "path": f"svg/{name}.svg",
            "rtl": {"mirror": name in MIRROR, "decision": "Mirror for logical navigation or sending direction." if name in MIRROR else "Use the same glyph; external target direction stays literal." if name in CONTEXTUAL else "Keep original; physical object, status, vertical direction or data symbol."},
            "source": f"https://github.com/lucide-icons/lucide/blob/{VERSION}/icons/{name}.svg",
            "package": f"lucide-static@{VERSION}", "sha256": hashlib.sha256(original).hexdigest(),
        })
license_members = [m for m in archive.getmembers() if m.name == "package/LICENSE"]
if not license_members:
    raise ValueError("No distributed license")
(ROOT / "LICENSE").write_bytes(archive.extractfile(license_members[0]).read())
manifest = {
    "name": "Clinime icon source pack", "version": "1.0.0", "upstream": "Lucide",
    "upstream_version": VERSION, "retrieved_on": "2026-10-26", "count": len(icons),
    "source_tarball": TARBALL, "source_tarball_sha256": hashlib.sha256(archive_bytes).hexdigest(),
    "license": "ISC; derived Feather icons also carry the distributed MIT notice", "license_file": "LICENSE",
    "spec": {"viewBox": "0 0 24 24", "stroke_width": 2, "stroke_linecap": "round", "stroke_linejoin": "round", "fill": "none", "color": "currentColor", "ui_sizes": [16, 20, 24]},
    "accessibility": "Visible labels determine meaning. Decorative icons are hidden from assistive technology. Name icon-only controls. Never use a glyph or color as the only state cue.",
    "rtl_note": "Mirroring is the Clinime context decision. Source SVGs remain unmodified; mirror component instances at runtime or use an RTL variant.",
    "icons": icons,
}
(ROOT / "icon-manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
symbols = []
import re
for item in icons:
    svg = (ROOT / item["path"]).read_text()
    body = re.sub(r"^.*?<svg\b[^>]*>", "", svg, flags=re.S).rsplit("</svg>", 1)[0]
    symbols.append(f'<symbol id="i-{item["name"]}" viewBox="0 0 24 24">{body}</symbol>')
(ROOT / "clinime-icons.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg">' + "\n".join(symbols) + '</svg>')
print(json.dumps({"version": VERSION, "count": len(icons), "manifest": str(ROOT / "icon-manifest.json")}, indent=2))
if (ROOT / "reconcile-icon-pack.py").exists():
    import subprocess
    import sys
    subprocess.run([sys.executable, str(ROOT / "reconcile-icon-pack.py")], check=True)
