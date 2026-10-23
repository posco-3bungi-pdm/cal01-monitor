import importlib.util
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.db import OperationalError
from django.test import Client, RequestFactory, SimpleTestCase, TestCase, override_settings
from waitress.adjustments import Adjustments
from waitress.proxy_headers import proxy_headers_middleware

from config.serve import server_options
from monitor.auth_views import failure_keys


def isolated_settings(**environment):
    filename = Path(__file__).resolve().parents[2] / "config" / "settings.py"
    spec = importlib.util.spec_from_file_location("isolated_deployment_settings", filename)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(os.environ, {"DJANGO_SECRET_KEY": "tests-only-deployment-secret-never-for-a-real-server", **environment}, clear=True):
        spec.loader.exec_module(module)
    return module


class DeploymentSettingsTests(SimpleTestCase):
    def railway_settings(self, **environment):
        return isolated_settings(CAL01_DEPLOYMENT="railway", RAILWAY_PUBLIC_DOMAIN="team.up.railway.app", **environment)

    def test_local_settings_keep_existing_pg_and_http_behavior(self):
        settings = isolated_settings(CAL01_LOCAL_HTTP="1", PGDATABASE="existing", PGPORT="55432")
        self.assertEqual(settings.DATABASES["default"]["NAME"], "existing")
        self.assertEqual(settings.DATABASES["default"]["PORT"], "55432")
        self.assertNotIn("OPTIONS", settings.DATABASES["default"])
        self.assertFalse(settings.SESSION_COOKIE_SECURE)
        self.assertTrue(settings.LOGIN_LIMIT_REMOTE_ADDRESS)
        self.assertEqual(server_options(settings, {})["listen"], "127.0.0.1:9017")

    def test_railway_https_and_exact_domains_without_proxy_header_trust(self):
        settings = self.railway_settings(DJANGO_ALLOWED_HOSTS="review.example.com", PGSSLMODE="require")
        self.assertEqual(settings.ALLOWED_HOSTS, ["review.example.com", "team.up.railway.app", "healthcheck.railway.app"])
        self.assertEqual(settings.CSRF_TRUSTED_ORIGINS, ["https://review.example.com", "https://team.up.railway.app"])
        self.assertTrue(settings.SESSION_COOKIE_SECURE)
        self.assertTrue(settings.CSRF_COOKIE_SECURE)
        self.assertTrue(settings.SECURE_SSL_REDIRECT)
        self.assertFalse(hasattr(settings, "SECURE_PROXY_SSL_HEADER"))
        self.assertEqual(settings.DATABASES["default"]["OPTIONS"], {"sslmode": "require", "connect_timeout": 10})
        self.assertFalse(settings.LOGIN_LIMIT_REMOTE_ADDRESS)

    def test_generic_cloud_requires_no_provider_variables(self):
        settings = isolated_settings(CAL01_DEPLOYMENT="cloud", DJANGO_ALLOWED_HOSTS="review.example.com")
        self.assertEqual(settings.ALLOWED_HOSTS, ["review.example.com"])
        self.assertEqual(settings.CSRF_TRUSTED_ORIGINS, ["https://review.example.com"])
        self.assertTrue(settings.CLOUD_DEPLOYMENT)
        self.assertFalse(settings.RAILWAY_DEPLOYMENT)
        self.assertTrue(settings.SESSION_COOKIE_SECURE)
        self.assertFalse(settings.LOGIN_LIMIT_REMOTE_ADDRESS)
        options = server_options(settings, {"PORT": "10000"})
        self.assertEqual(options["listen"], "0.0.0.0:10000")
        self.assertEqual(options["url_scheme"], "https")

    def test_cloud_connection_timeout_is_bounded_and_configurable(self):
        self.assertEqual(self.railway_settings(PGCONNECT_TIMEOUT="7").DATABASES["default"]["OPTIONS"]["connect_timeout"], 7)
        for value in ["0", "-1", "61", "infinite"]:
            with self.subTest(value=value), self.assertRaises(ImproperlyConfigured):
                self.railway_settings(PGCONNECT_TIMEOUT=value)

    def test_insecure_and_overbroad_public_settings_are_rejected(self):
        for option in [
            {"DJANGO_DEBUG": "1"}, {"CAL01_LOCAL_HTTP": "1"}, {"CAL01_TRUST_LOCAL_PROXY": "1"},
            {"DJANGO_ALLOWED_HOSTS": "*"}, {"DJANGO_ALLOWED_HOSTS": ".railway.app"},
            {"DJANGO_ALLOWED_HOSTS": "https://review.example.com"},
            {"DJANGO_CSRF_TRUSTED_ORIGINS": "http://team.up.railway.app"},
            {"DJANGO_CSRF_TRUSTED_ORIGINS": "https://evil.example.com"},
            {"DJANGO_CSRF_TRUSTED_ORIGINS": "https://user@team.up.railway.app"},
        ]:
            with self.subTest(option=next(iter(option))), self.assertRaises(ImproperlyConfigured):
                self.railway_settings(**option)
        with self.assertRaises(ImproperlyConfigured):
            isolated_settings(CAL01_DEPLOYMENT="railway")

    def test_waitress_accepts_bounded_public_startup_options(self):
        settings = self.railway_settings()
        options = server_options(settings, {"PORT": "45678", "CAL01_SERVER_THREADS": "6"})
        adjustments = Adjustments(**options)
        self.assertEqual(options["listen"], "0.0.0.0:45678")
        self.assertEqual(adjustments.url_scheme, "https")
        self.assertEqual(adjustments.threads, 6)
        self.assertEqual(adjustments.max_request_body_size, 513 * 1024 * 1024)
        self.assertIsNone(adjustments.trusted_proxy)
        self.assertEqual(adjustments.trusted_proxy_headers, set())
        self.assertTrue(adjustments.clear_untrusted_proxy_headers)
        for invalid in [{"PORT": "0"}, {"PORT": "65536"}, {"PORT": "bad"}, {"CAL01_SERVER_THREADS": "0"}]:
            with self.subTest(invalid=invalid), self.assertRaises(ImproperlyConfigured):
                server_options(settings, invalid)

    def test_sqlite_is_available_for_tests_but_cannot_start_public_server(self):
        settings = self.railway_settings(CAL01_TEST_SQLITE="1")
        self.assertTrue(settings.DATABASES["default"]["ENGINE"].endswith("sqlite3"))
        self.assertTrue(settings.SESSION_COOKIE_SECURE)
        with self.assertRaises(ImproperlyConfigured):
            server_options(settings, {})

    def test_caller_forwarding_headers_cannot_change_scheme_host_or_peer(self):
        captured = {}
        def app(environ, start_response):
            captured.update(environ)
            return []
        wrapped = proxy_headers_middleware(app, trusted_proxy=None, trusted_proxy_headers=set(), clear_untrusted=True)
        wrapped({
            "REMOTE_ADDR": "10.0.0.8", "HTTP_HOST": "team.up.railway.app", "wsgi.url_scheme": "https",
            "HTTP_X_FORWARDED_FOR": "203.0.113.8", "HTTP_X_FORWARDED_PROTO": "http",
            "HTTP_X_FORWARDED_HOST": "evil.example", "HTTP_FORWARDED": "for=203.0.113.8;proto=http",
            "HTTP_X_REAL_IP": "203.0.113.9",
        }, lambda *args: None)
        self.assertEqual(captured["REMOTE_ADDR"], "10.0.0.8")
        self.assertEqual(captured["HTTP_HOST"], "team.up.railway.app")
        self.assertEqual(captured["wsgi.url_scheme"], "https")
        self.assertNotIn("HTTP_X_FORWARDED_PROTO", captured)
        with override_settings(LOGIN_LIMIT_REMOTE_ADDRESS=False):
            factory = RequestFactory()
            first = factory.post("/api/login", REMOTE_ADDR="10.0.0.8", HTTP_X_REAL_IP="203.0.113.1")
            second = factory.post("/api/login", REMOTE_ADDR="10.0.0.9", HTTP_X_REAL_IP="203.0.113.2")
            self.assertEqual(failure_keys(first, "minho"), failure_keys(second, "minho"))
            self.assertEqual(len(failure_keys(first, "minho")), 1)


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    ALLOWED_HOSTS=["team.up.railway.app", "healthcheck.railway.app"],
    CSRF_TRUSTED_ORIGINS=["https://team.up.railway.app"],
    SESSION_COOKIE_SECURE=True, CSRF_COOKIE_SECURE=True,
    SECURE_SSL_REDIRECT=True, SECURE_PROXY_SSL_HEADER=None,
    LOGIN_LIMIT_REMOTE_ADDRESS=False, LOGIN_FAILURE_LIMIT=2,
)
class RailwaySessionTests(TestCase):
    def setUp(self):
        cache.clear()
        for name in ["alice", "bob"]:
            get_user_model().objects.create_user(name, password="unit-test-password-only")
        self.client = Client(enforce_csrf_checks=True)
        self.headers = {"secure": True, "HTTP_HOST": "team.up.railway.app", "REMOTE_ADDR": "10.0.0.8",
                        "HTTP_ORIGIN": "https://team.up.railway.app"}
        response = self.client.get("/api/csrf", **self.headers)
        self.token = response.json()["csrfToken"]
        self.assertTrue(response.cookies["csrftoken"]["secure"])

    def post_login(self, username, password="wrong", **extra):
        return self.client.post("/api/login", {"username": username, "password": password},
            content_type="application/json", HTTP_X_CSRFTOKEN=self.token, **{**self.headers, **extra})

    def test_one_account_failure_does_not_lock_every_user_behind_edge(self):
        for _ in range(2):
            self.assertEqual(self.post_login("alice").status_code, 401)
        self.assertEqual(self.post_login("alice", HTTP_X_REAL_IP="203.0.113.99").status_code, 429)
        success = self.post_login("bob", "unit-test-password-only")
        self.assertEqual(success.status_code, 200)
        self.assertTrue(success.cookies["sessionid"]["secure"])
        self.assertEqual(self.client.get("/api/me", **self.headers).json()["user"]["username"], "bob")

    def test_remote_login_still_checks_origin_and_csrf(self):
        response = self.post_login("bob", "unit-test-password-only", HTTP_ORIGIN="https://evil.example")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.post_login("bob", "unit-test-password-only", HTTP_ORIGIN="https://team.up.railway.app").status_code, 200)
        self.assertEqual(self.client.get("/api/csrf", secure=True, HTTP_HOST="evil.example").status_code, 400)
        self.assertEqual(self.client.get("/api/health", secure=True, HTTP_HOST="healthcheck.railway.app").status_code, 200)


class ReadinessTests(TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.settings_override = override_settings(CAL01_FRONTEND_ROOT=self.root)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

    def test_public_readiness_checks_build_and_select_one(self):
        (self.root / "index.html").write_text("<!doctype html><title>CAL01</title>", encoding="utf-8")
        with self.assertNumQueries(1):
            response = self.client.get("/api/ready")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"service": "cal01-monitor", "ready": True})
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(self.client.post("/api/ready").status_code, 405)

    def test_missing_build_returns_generic_failure_without_querying_database(self):
        with self.assertNumQueries(0):
            response = self.client.get("/api/ready")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"service": "cal01-monitor", "ready": False})
        self.assertEqual(self.client.get("/api/health").status_code, 200)

    def test_database_failure_does_not_expose_connection_details(self):
        (self.root / "index.html").write_text("build", encoding="utf-8")
        with patch("monitor.auth_views.connection.cursor", side_effect=OperationalError("private-database-detail")):
            response = self.client.get("/api/ready")
            self.assertEqual(self.client.get("/api/health").status_code, 200)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"service": "cal01-monitor", "ready": False})
        self.assertNotContains(response, "private-database-detail", status_code=503)
