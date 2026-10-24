import os
import re
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
TEST_SQLITE = os.environ.get("CAL01_TEST_SQLITE") == "1"
CAL01_DEPLOYMENT = os.environ.get("CAL01_DEPLOYMENT", "local")
if CAL01_DEPLOYMENT not in {"local", "cloud", "railway"}:
    raise ImproperlyConfigured("CAL01_DEPLOYMENT must be local, cloud or railway.")
CLOUD_DEPLOYMENT = CAL01_DEPLOYMENT in {"cloud", "railway"}
RAILWAY_DEPLOYMENT = CAL01_DEPLOYMENT == "railway"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if TEST_SQLITE:
        SECRET_KEY = "test-only-never-use-for-a-team-server"
    else:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set in the local server environment.")

DEBUG = os.environ.get("DJANGO_DEBUG") == "1"
ALLOWED_HOSTS = [
    item.strip()
    for item in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if item.strip()
]
if CLOUD_DEPLOYMENT:
    if DEBUG or os.environ.get("CAL01_LOCAL_HTTP") == "1" or os.environ.get("CAL01_TRUST_LOCAL_PROXY") == "1":
        raise ImproperlyConfigured("Cloud hosting requires DEBUG off, secure cookies, and no arbitrary proxy-header trust.")
    ALLOWED_HOSTS = [host.strip().lower() for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",") if host.strip()]
    if render_hostname := os.environ.get("RENDER_EXTERNAL_HOSTNAME", "").strip().lower():
        ALLOWED_HOSTS.append(render_hostname)
    if RAILWAY_DEPLOYMENT:
        if public_domain := os.environ.get("RAILWAY_PUBLIC_DOMAIN", "").strip().lower():
            ALLOWED_HOSTS.append(public_domain)
    if not ALLOWED_HOSTS or any(
        len(host) > 253 or not all(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                                  for label in host.split("."))
        for host in ALLOWED_HOSTS
    ):
        raise ImproperlyConfigured("Cloud hosting needs exact public hostnames in DJANGO_ALLOWED_HOSTS; no URL or wildcard.")
    if RAILWAY_DEPLOYMENT:
        # Railway's deployment probe uses this Host, not the public domain.
        ALLOWED_HOSTS.append("healthcheck.railway.app")
    ALLOWED_HOSTS = list(dict.fromkeys(ALLOWED_HOSTS))
if TEST_SQLITE:
    ALLOWED_HOSTS.append("testserver")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "monitor",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "monitor.presentation_middleware.PresentationReadOnlyMiddleware",
    "monitor.upload_limits.CsvUploadLimitMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
WSGI_APPLICATION = "config.wsgi.application"
DATABASES = {"default": {
    "ENGINE": "django.db.backends.postgresql",
    "NAME": os.environ.get("PGDATABASE", "cal01_monitor"),
    "USER": os.environ.get("PGUSER", "cal01_monitor"),
    "PASSWORD": os.environ.get("PGPASSWORD", ""),
    "HOST": os.environ.get("PGHOST", "127.0.0.1"),
    "PORT": os.environ.get("PGPORT", "55432"),
    "CONN_MAX_AGE": 60,
}}
if sslmode := os.environ.get("PGSSLMODE", ""):
    DATABASES["default"]["OPTIONS"] = {"sslmode": sslmode}
if CLOUD_DEPLOYMENT:
    try:
        connect_timeout = int(os.environ.get("PGCONNECT_TIMEOUT", "10"))
    except ValueError:
        raise ImproperlyConfigured("PGCONNECT_TIMEOUT must be an integer between 1 and 60 seconds.") from None
    if not 1 <= connect_timeout <= 60:
        raise ImproperlyConfigured("PGCONNECT_TIMEOUT must be between 1 and 60 seconds.")
    DATABASES["default"].setdefault("OPTIONS", {})["connect_timeout"] = connect_timeout
if TEST_SQLITE:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "ko-kr"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
APPEND_SLASH = False
STATIC_URL = "/static/"
STATIC_ROOT = Path(os.environ.get("CAL01_STATIC_ROOT", str(BASE_DIR / "staticfiles")))
CAL01_FRONTEND_ROOT = Path(os.environ.get("CAL01_FRONTEND_ROOT", str(BASE_DIR.parent / "frontend" / "dist")))
WHITENOISE_ROOT = CAL01_FRONTEND_ROOT
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
LOCAL_HTTP = not CLOUD_DEPLOYMENT and (os.environ.get("CAL01_LOCAL_HTTP") == "1" or TEST_SQLITE)
SESSION_COOKIE_SECURE = not LOCAL_HTTP
CSRF_COOKIE_SECURE = not LOCAL_HTTP
SESSION_COOKIE_AGE = 60 * 60 * 12
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
CSRF_TRUSTED_ORIGINS = [
    item.strip()
    for item in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",")
    if item.strip()
]
if CLOUD_DEPLOYMENT:
    if not CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS = [f"https://{host}" for host in ALLOWED_HOSTS if host not in {"healthcheck.railway.app", "testserver"}]
    for origin in CSRF_TRUSTED_ORIGINS:
        try:
            parsed = urlsplit(origin)
            valid = (parsed.scheme == "https" and parsed.hostname in ALLOWED_HOSTS
                     and parsed.port in (None, 443) and not parsed.username and not parsed.password
                     and not parsed.path and not parsed.query and not parsed.fragment)
        except ValueError:
            valid = False
        if not valid:
            raise ImproperlyConfigured("Cloud CSRF origins must be exact https:// allowed-host origins.")
# Only trust this header when Waitress is bound to loopback behind the local proxy.
if os.environ.get("CAL01_TRUST_LOCAL_PROXY") == "1":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = CLOUD_DEPLOYMENT
SECURE_HSTS_SECONDS = 3600 if CLOUD_DEPLOYMENT else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["monitor.permissions.AuthenticatedPresentationAccess"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
}
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
LOGIN_FAILURE_LIMIT = 10
LOGIN_FAILURE_WINDOW = 15 * 60
# A cloud edge socket is shared by visitors. Do not lock the whole team out
# or trust an unverified X-Real-IP supplied through another ingress. The per-user
# limit remains active; run one application replica while this cache is local.
LOGIN_LIMIT_REMOTE_ADDRESS = not CLOUD_DEPLOYMENT
restore_required = os.environ.get("CAL01_REQUIRE_RESTORED_DB", "0")
if restore_required not in {"0", "1"}:
    raise ImproperlyConfigured("CAL01_REQUIRE_RESTORED_DB must be 0 or 1.")
CAL01_REQUIRE_RESTORED_DB = restore_required == "1"
CAL01_EXPECTED_DATASET_SHA256 = os.environ.get("CAL01_EXPECTED_DATASET_SHA256", "").strip().lower()
if CAL01_EXPECTED_DATASET_SHA256 and not re.fullmatch(r"[0-9a-f]{64}", CAL01_EXPECTED_DATASET_SHA256):
    raise ImproperlyConfigured("CAL01_EXPECTED_DATASET_SHA256 must be a SHA-256 hex digest.")
CAL01_MODEL_VERSION = "cal01-concept-v1"
CAL01_UPLOAD_MAX_BYTES = 512 * 1024 * 1024
CAL01_UPLOAD_MAX_ROWS = 500_000

presentation_enabled = os.environ.get("CAL01_PRESENTATION_ENABLED", "0")
if presentation_enabled not in {"0", "1"}:
    raise ImproperlyConfigured("CAL01_PRESENTATION_ENABLED must be 0 or 1.")
CAL01_PRESENTATION_ENABLED = presentation_enabled == "1"

try:
    CAL01_PRESENTATION_DATASET_IDS = tuple(dict.fromkeys(
        str(UUID(value.strip()))
        for value in os.environ.get("CAL01_PRESENTATION_DATASET_IDS", "").split(",") if value.strip()
    ))
except ValueError:
    raise ImproperlyConfigured("CAL01_PRESENTATION_DATASET_IDS must contain only comma-separated dataset UUIDs.") from None
