"""Validate the deployment using fixture values; never start services."""
from pathlib import Path
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
DEPLOY = ROOT / "deploy" / "hetzner"


class ConfigurationFilesTest(unittest.TestCase):
    def test_secret_placeholders_are_empty_and_keys_are_unique(self):
        pairs = [
            line.split("=", 1)
            for line in (DEPLOY / ".env.example").read_text().splitlines()
            if line and not line.startswith("#")
        ]
        self.assertEqual(len(pairs), len(dict(pairs)), "Duplicate environment key")
        for key, value in pairs:
            if re.search(r"SECRET|KEY|PASSWORD|TOKEN", key):
                self.assertEqual(value, "", f"{key} must not contain a credential")

    def test_migrator_uses_checkout_dependencies_and_schema(self):
        source = (ROOT / "apps/api/Dockerfile.multistage").read_text()
        migration = source.split("FROM builder AS migrator", 1)[1].split("FROM ", 1)[0]
        self.assertIn("WORKDIR /app/packages/db", migration)
        self.assertIn('"/app/node_modules/prisma/build/index.js"', migration)
        self.assertIn('"prisma.config.ts"', migration)
        self.assertNotIn("bun install", migration)


class ComposeConfigurationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which("docker"):
            raise unittest.SkipTest("Docker CLI is unavailable")
        result = subprocess.run(
            ["docker", "compose", "version"], capture_output=True, timeout=10
        )
        if result.returncode:
            raise unittest.SkipTest("Docker Compose plugin is unavailable")

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="comp-compose-test-")
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name) / "repo"
        self.deploy = self.repo / "deploy" / "hetzner"
        self.deploy.mkdir(parents=True)
        shutil.copyfile(DEPLOY / "compose.yml", self.deploy / "compose.yml")
        sample = (DEPLOY / ".env.example").read_text()
        self.env_text = sample.replace(
            "POSTGRES_PASSWORD=", "POSTGRES_PASSWORD=fixture-only-password"
        )
        (self.deploy / ".env").write_text(self.env_text)
        self.env = {
            key: value
            for key, value in os.environ.items()
            if key in ["PATH", "HOME", "DOCKER_CONFIG", "DOCKER_HOST"]
        }

    def configure(self):
        return subprocess.run(
            [
                "docker", "compose", "--project-directory", str(self.deploy),
                "--profile", "migrate", "-f", str(self.deploy / "compose.yml"),
                "config", "--format", "json",
            ],
            capture_output=True, text=True, env=self.env, timeout=20,
        )

    def config(self):
        result = self.configure()
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_private_services_are_not_published_on_host(self):
        services = self.config()["services"]
        for service in ["postgres", "api", "app"]:
            self.assertFalse(services[service].get("ports"), service)
        self.assertEqual(
            {port["target"] for port in services["caddy"]["ports"]}, {80, 443}
        )
        self.assertEqual(services["postgres"]["image"], "postgres:18-alpine")
        self.assertEqual(
            services["postgres"]["volumes"][0]["target"], "/var/lib/postgresql"
        )

    def test_builds_are_portable_and_preserve_self_hosting(self):
        services = self.config()["services"]
        for name in ["api", "app", "migrator"]:
            self.assertEqual(services[name]["build"]["context"], str(self.repo))
        self.assertEqual(services["api"]["image"], "comp-ai-api:local")
        self.assertEqual(services["app"]["image"], "comp-ai-app:local")
        for name in ["api", "app"]:
            env = services[name]["environment"]
            self.assertEqual(env["NEXT_PUBLIC_SELF_HOSTED"], "true")
            self.assertEqual(env["NEXT_PUBLIC_API_URL"], "https://api.comp.example.com")
            self.assertEqual(env["PRISMA_DISABLE_TLS"], "1")
        args = services["app"]["build"]["args"]
        self.assertEqual(args["BUILD_MEMORY_LIMIT_MB"], "3072")
        self.assertEqual(args["SKIP_NEXT_TYPECHECK"], "true")
        self.assertEqual(args["NEXT_PUBLIC_SELF_HOSTED"], "true")

    def test_migration_is_explicit_and_uses_api_builder(self):
        migration = self.config()["services"]["migrator"]
        self.assertEqual(migration["profiles"], ["migrate"])
        self.assertEqual(migration["build"]["target"], "migrator")
        self.assertEqual(
            migration["build"]["dockerfile"], "apps/api/Dockerfile.multistage"
        )
        self.assertEqual(
            migration["depends_on"]["postgres"]["condition"], "service_healthy"
        )

    def test_missing_database_password_fails_before_startup(self):
        (self.deploy / ".env").write_text(
            self.env_text.replace("POSTGRES_PASSWORD=fixture-only-password", "POSTGRES_PASSWORD=")
        )
        result = self.configure()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("POSTGRES_PASSWORD", result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
