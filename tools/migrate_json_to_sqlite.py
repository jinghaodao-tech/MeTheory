from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "preference_mirror.sqlite3"


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def json_text(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def migrate(database_path: Path, prompts_path: Path, domain_schema_path: Path) -> None:
    prompts = load_json(prompts_path)
    domain_schema = load_json(domain_schema_path)
    database_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(database_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript((ROOT / "db" / "schema.sql").read_text(encoding="utf-8"))
        for table in (
            "ai_template_instructions",
            "ai_templates",
            "domain_entity_required_fields",
            "domain_entity_fields",
            "domain_entities",
            "metadata",
        ):
            connection.execute(f"DELETE FROM {table}")

        connection.executemany(
            "INSERT INTO metadata(key, value) VALUES (?, ?)",
            [
                ("source_prompts_file", str(prompts_path.relative_to(ROOT))),
                ("source_domain_schema_file", str(domain_schema_path.relative_to(ROOT))),
                ("prompts_package_name", prompts["package_name"]),
                ("prompts_package_version", prompts["version"]),
                ("prompts_locale", prompts["locale"]),
                ("domain_schema_name", domain_schema["schema_name"]),
                ("domain_schema_version", domain_schema["version"]),
            ],
        )

        for template in prompts["templates"]:
            name = template["template_name"]
            connection.execute(
                """
                INSERT INTO ai_templates(
                    template_name, package_name, package_version, locale, purpose,
                    input_schema_json, output_schema_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    name,
                    prompts["package_name"],
                    prompts["version"],
                    prompts["locale"],
                    template["purpose"],
                    json_text(template["input_schema"]),
                    json_text(template["output_schema"]),
                ),
            )
            connection.executemany(
                "INSERT INTO ai_template_instructions(template_name, instruction_order, instruction) VALUES (?, ?, ?)",
                [(name, order, instruction) for order, instruction in enumerate(template["developer_instructions"])],
            )

        for entity_name, entity in domain_schema["entities"].items():
            connection.execute(
                "INSERT INTO domain_entities(entity_name, schema_name, schema_version) VALUES (?, ?, ?)",
                (entity_name, domain_schema["schema_name"], domain_schema["version"]),
            )
            connection.executemany(
                "INSERT INTO domain_entity_required_fields(entity_name, field_order, field_name) VALUES (?, ?, ?)",
                [(entity_name, order, field_name) for order, field_name in enumerate(entity["required"])],
            )
            connection.executemany(
                "INSERT INTO domain_entity_fields(entity_name, field_name, field_type_json) VALUES (?, ?, ?)",
                [(entity_name, field_name, json_text(field_type)) for field_name, field_type in entity["fields"].items()],
            )

        template_count = connection.execute("SELECT COUNT(*) FROM ai_templates").fetchone()[0]
        entity_count = connection.execute("SELECT COUNT(*) FROM domain_entities").fetchone()[0]
        if template_count != len(prompts["templates"]):
            raise RuntimeError("template count mismatch after migration")
        if entity_count != len(domain_schema["entities"]):
            raise RuntimeError("entity count mismatch after migration")

    print(f"Migrated {template_count} templates and {entity_count} domain entities to {database_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate Preference Mirror JSON specs to SQLite")
    parser.add_argument("--database", type=Path, default=DEFAULT_DB)
    parser.add_argument("--prompts", type=Path, default=ROOT / "prompts" / "ai-templates.json")
    parser.add_argument("--domain-schema", type=Path, default=ROOT / "schemas" / "domain-schema.json")
    args = parser.parse_args()
    migrate(args.database.resolve(), args.prompts.resolve(), args.domain_schema.resolve())


if __name__ == "__main__":
    main()
