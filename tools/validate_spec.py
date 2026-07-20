from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_TEMPLATES = {
    "pm_nl_structurer_v1",
    "pm_hypothesis_generator_v1",
    "pm_next_question_suggester_v1",
    "pm_safe_explanation_renderer_v1",
}
FORBIDDEN_WORDS = [
    "診断します",
    "治療します",
    "病名は",
    "原因は",
    "性格です",
]


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def assert_template_package(data: dict) -> None:
    templates = data.get("templates")
    if not isinstance(templates, list):
        raise AssertionError("prompts/ai-templates.json must contain a templates array")

    names = {template.get("template_name") for template in templates}
    missing = REQUIRED_TEMPLATES - names
    if missing:
        raise AssertionError(f"missing required templates: {sorted(missing)}")

    for template in templates:
        name = template.get("template_name", "<unknown>")
        for key in ("purpose", "developer_instructions", "input_schema", "output_schema"):
            if key not in template:
                raise AssertionError(f"{name} missing {key}")
        instructions = "\n".join(template.get("developer_instructions", []))
        for word in FORBIDDEN_WORDS:
            if word in instructions:
                raise AssertionError(f"{name} contains forbidden phrase: {word}")


def assert_domain_schema(data: dict) -> None:
    entities = data.get("entities")
    if not isinstance(entities, dict):
        raise AssertionError("schemas/domain-schema.json must contain entities")

    for entity in ("self_belief", "hypothesis", "checkin", "observation", "notification_preference"):
        if entity not in entities:
            raise AssertionError(f"missing domain entity: {entity}")
        if "required" not in entities[entity] or "fields" not in entities[entity]:
            raise AssertionError(f"{entity} must define required and fields")


def main() -> None:
    prompts = load_json(ROOT / "prompts" / "ai-templates.json")
    domain_schema = load_json(ROOT / "schemas" / "domain-schema.json")

    assert_template_package(prompts)
    assert_domain_schema(domain_schema)

    print("Preference Mirror spec validation passed.")


if __name__ == "__main__":
    main()
