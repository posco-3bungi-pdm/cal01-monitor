"""Run the same application locally or behind an HTTPS-only cloud edge.

Set the scheme from deployment configuration, never from caller-supplied
forwarding headers. Cloud mode requires an edge that terminates TLS and makes
the application port inaccessible from the public internet. Do not expose a
TCP proxy for this web service. Team access uses its HTTPS domain only.

The Railway alias uses its documented HTTPS edge without assuming a fixed
trusted peer range or an overwrite contract for every forwarding header:
https://docs.railway.com/networking/public-networking/specs-and-limits
"""
import os

from django.core.exceptions import ImproperlyConfigured


def integer_option(environment, name, default, minimum, maximum):
    try:
        value = int(environment.get(name, str(default)))
    except (TypeError, ValueError):
        raise ImproperlyConfigured(f"{name} must be an integer.") from None
    if not minimum <= value <= maximum:
        raise ImproperlyConfigured(f"{name} must be between {minimum} and {maximum}.")
    return value


def server_options(settings, environment=None):
    environment = os.environ if environment is None else environment
    cloud = settings.CLOUD_DEPLOYMENT
    if cloud and settings.TEST_SQLITE:
        raise ImproperlyConfigured("Cloud hosting must use PostgreSQL, not CAL01_TEST_SQLITE.")
    port = integer_option(environment, "PORT", 8080 if cloud else 9017, 1, 65535)
    return {
        "listen": f"{'0.0.0.0' if cloud else '127.0.0.1'}:{port}",
        "url_scheme": "https" if cloud else "http",
        "threads": integer_option(environment, "CAL01_SERVER_THREADS", 8 if cloud else 4, 2, 32),
        "channel_timeout": 600,
        "max_request_body_size": settings.CAL01_UPLOAD_MAX_BYTES + 1024 * 1024,
        "max_request_header_size": 32768,
        "trusted_proxy": None,
        "trusted_proxy_headers": set(),
        "clear_untrusted_proxy_headers": True,
        "expose_tracebacks": False,
        "ident": "",
    }


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.conf import settings
    from django.core.wsgi import get_wsgi_application
    from waitress import serve

    from config.restored_database import require_restored_database

    options = server_options(settings)
    application = get_wsgi_application()
    if settings.CAL01_REQUIRE_RESTORED_DB:
        require_restored_database()
    serve(application, **options)


if __name__ == "__main__":
    main()
